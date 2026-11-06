import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { STORAGE_ROOT } from './storagePaths.js'
import { readImageMetadata } from './imageMetadata.js'
import { securityDb } from './identity.js'

// Profile photos are private account data, so they live outside the public
// /uploads and /media folders and are only served to their owner.
const AVATARS = path.join(STORAGE_ROOT, 'avatars')
const EXTENSIONS = { jpeg: '.jpg', png: '.png', webp: '.webp' }
const CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MIN_PIXELS = 64
const MAX_PIXELS = 1024
const DEFAULT_MAX_BYTES = 512 * 1024

export const AVATAR_MAX_BYTES = (() => {
  const configured = Number(process.env.AVATAR_MAX_BYTES)
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_BYTES
})()

const uploading = new Set()
const failure = (message, status = 400) => Object.assign(new Error(message), { status })
// Hashing keeps account ids out of file names and rules out path tricks.
const stem = (userId) => crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 40)

async function findAvatar(userId) {
  const base = stem(userId)
  for (const extension of Object.values(EXTENSIONS)) {
    const file = path.join(AVATARS, base + extension)
    try {
      const stat = await fsp.stat(file)
      if (stat.isFile()) return { file, version: Math.floor(stat.mtimeMs) }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return null
}

// Used by GET /api/accounts/me so the client always knows whether a photo exists.
export async function avatarUrlFor(userId) {
  try {
    const found = await findAvatar(userId)
    return found ? `/api/accounts/me/avatar?v=${found.version}` : null
  } catch {
    return null
  }
}

async function removeAvatarFiles(userId, keepName = '') {
  const base = stem(userId)
  await Promise.all(Object.values(EXTENSIONS)
    .filter((extension) => base + extension !== keepName)
    .map((extension) => fsp.rm(path.join(AVATARS, base + extension), { force: true })))
}

async function receive(req, destination) {
  let size = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length
      if (size > AVATAR_MAX_BYTES) callback(failure(`Photo must be ${Math.floor(AVATAR_MAX_BYTES / 1024)} KB or smaller.`, 413))
      else callback(null, chunk)
    },
  })
  await pipeline(req, limiter, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
  return size
}

export function createAvatarRouter(express) {
  const router = express.Router()
  const run = (handler) => async (req, res, next) => {
    try { await handler(req, res) } catch (error) {
      if (error.status) res.status(error.status).json({ error: error.message })
      else next(error)
    }
  }

  router.get('/', run(async (req, res) => {
    const found = await findAvatar(req.identity.user.id)
    if (!found) throw failure('No profile photo.', 404)
    await new Promise((resolve, reject) => res.sendFile(found.file, {
      dotfiles: 'allow',
      cacheControl: false,
      // The URL carries ?v=<mtime>, so a changed photo always gets a new URL.
      headers: { 'Cache-Control': 'private, max-age=86400', 'Content-Disposition': 'inline' },
    }, (error) => error ? reject(error) : resolve()))
  }))

  router.put('/', run(async (req, res) => {
    const userId = req.identity.user.id
    const type = String(req.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
    const encoding = req.get('Content-Encoding')
    if (!CONTENT_TYPES.has(type) || (encoding && encoding !== 'identity')) throw failure('Use a JPEG, PNG or WebP photo.', 415)
    const declared = req.get('Content-Length')
    if (declared === undefined) throw failure('Content length is required.', 411)
    if (Number(declared) > AVATAR_MAX_BYTES) throw failure(`Photo must be ${Math.floor(AVATAR_MAX_BYTES / 1024)} KB or smaller.`, 413)
    if (uploading.has(userId)) throw failure('A photo upload is already in progress.', 409)

    uploading.add(userId)
    const temporary = path.join(AVATARS, `${stem(userId)}.${crypto.randomUUID()}.part`)
    try {
      await fsp.mkdir(AVATARS, { recursive: true, mode: 0o700 })
      await receive(req, temporary)
      let metadata
      try { metadata = await readImageMetadata(temporary) } catch (error) {
        throw failure(error.status ? error.message : 'This file is not a readable image.', error.status || 400)
      }
      const extension = EXTENSIONS[metadata.format]
      if (!extension || metadata.width !== metadata.height || metadata.width < MIN_PIXELS || metadata.width > MAX_PIXELS) {
        throw failure(`Use a square JPEG, PNG or WebP photo between ${MIN_PIXELS} and ${MAX_PIXELS} pixels.`, 422)
      }
      const finalName = stem(userId) + extension
      await fsp.rename(temporary, path.join(AVATARS, finalName))
      await removeAvatarFiles(userId, finalName)
      res.json({ avatarUrl: await avatarUrlFor(userId) })
    } finally {
      uploading.delete(userId)
      await fsp.rm(temporary, { force: true }).catch(() => {})
    }
  }))

  router.delete('/', run(async (req, res) => {
    await removeAvatarFiles(req.identity.user.id)
    res.json({ ok: true, avatarUrl: null })
  }))

  return router
}

// Removes photos of deleted accounts and stale partial uploads.
export async function purgeOrphanAvatars() {
  let names
  try { names = await fsp.readdir(AVATARS) } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  let owners
  try { owners = new Set(securityDb().prepare('SELECT id FROM user').all().map((row) => stem(row.id))) } catch { return }
  const staleBefore = Date.now() - 3600000
  for (const name of names) {
    const file = path.join(AVATARS, name)
    if (name.endsWith('.part')) {
      const stat = await fsp.stat(file).catch(() => null)
      if (stat && stat.mtimeMs < staleBefore) await fsp.rm(file, { force: true })
    } else if (!owners.has(name.split('.')[0])) {
      await fsp.rm(file, { force: true })
    }
  }
}
