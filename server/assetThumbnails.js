import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readImageMetadata } from './imageMetadata.js'

const execute = promisify(execFile)
const pending = new Map()
let running = 0
const waiting = []

function localAssetPath(url, publicRoot, extensions) {
  let decoded
  try { decoded = decodeURIComponent(String(url || '')) } catch { return null }
  if (!/^\/(uploads|demo)\//.test(decoded) || decoded.includes('\\') || decoded.includes('\0')) return null
  const target = path.resolve(publicRoot, `.${decoded}`)
  const directory = path.join(publicRoot, decoded.startsWith('/uploads/') ? 'uploads' : 'demo')
  const relative = path.relative(directory, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !extensions.includes(path.extname(target).toLowerCase())) return null
  return target
}

export function imageAssetPath(url, publicRoot) {
  return localAssetPath(url, publicRoot, ['.jpg', '.jpeg', '.png', '.webp'])
}

async function modelCacheEntry(url, publicRoot, cacheRoot) {
  const target = localAssetPath(url, publicRoot, ['.glb', '.gltf'])
  if (!target) return null
  const real = await fs.realpath(target).catch(() => null)
  if (!real) return null
  const directory = await fs.realpath(path.join(publicRoot, String(url).startsWith('/demo/') ? 'demo' : 'uploads')).catch(() => null)
  const relative = directory && path.relative(directory, real)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  const stat = await fs.stat(real)
  if (!stat.isFile()) return null
  const key = crypto.createHash('sha256').update(`${real}:${stat.size}:${stat.mtimeMs}`).digest('hex')
  return { output: path.join(cacheRoot, `model-${key}.webp`), version: stat.mtime.toISOString() }
}

export async function cachedModelThumbnail(url, publicRoot, cacheRoot) {
  const entry = await modelCacheEntry(url, publicRoot, cacheRoot)
  return entry && await fs.stat(entry.output).then(stat => stat.isFile()).catch(() => false) ? entry.output : null
}

export async function saveModelThumbnail(url, version, bytes, publicRoot, cacheRoot) {
  const entry = await modelCacheEntry(url, publicRoot, cacheRoot)
  if (!entry) throw Object.assign(new Error('Model not found.'), { status: 404 })
  if (entry.version !== version) throw Object.assign(new Error('This model changed. Refresh the asset library and try again.'), { status: 409 })
  if (!Buffer.isBuffer(bytes) || bytes.length < 16 || bytes.length > 256 * 1024 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    throw Object.assign(new Error('Use a WebP thumbnail up to 256 KB.'), { status: 415 })
  }
  if (waiting.length >= 20) throw Object.assign(new Error('Thumbnail queue full. Try again shortly.'), { status: 429 })
  if (running >= 2) await new Promise(resolve => waiting.push(resolve))
  running += 1
  const temporary = path.join(cacheRoot, `${crypto.randomUUID()}.input.webp`)
  const encoded = temporary.replace('.input.webp', '.output.webp')
  try {
    await fs.mkdir(cacheRoot, { recursive: true })
    await fs.writeFile(temporary, bytes, { flag: 'wx' })
    const metadata = await readImageMetadata(temporary)
    if (metadata.format !== 'webp' || metadata.width > 1024 || metadata.height > 1024) throw Object.assign(new Error('Thumbnail dimensions exceed 1024 pixels.'), { status: 415 })
    // Decode and re-encode browser captures rather than serving arbitrary uploaded bytes.
    await execute('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '1', '-protocol_whitelist', 'file', '-i', temporary, '-vf', 'scale=480:320:force_original_aspect_ratio=decrease', '-frames:v', '1', '-map_metadata', '-1', '-c:v', 'libwebp', '-quality', '75', '-threads', '1', encoded], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 })
    const current = await modelCacheEntry(url, publicRoot, cacheRoot)
    if (current?.output !== entry.output) throw Object.assign(new Error('This model changed. Refresh the asset library and try again.'), { status: 409 })
    await fs.rename(encoded, entry.output)
    return entry.output
  } finally {
    await Promise.all([temporary, encoded].map(file => fs.rm(file, { force: true }).catch(() => {})))
    running -= 1
    waiting.shift()?.()
  }
}

export async function assetThumbnail(url, publicRoot, cacheRoot) {
  const target = imageAssetPath(url, publicRoot)
  if (!target) return null
  const real = await fs.realpath(target)
  const roots = await Promise.all(['uploads', 'demo'].map((name) => fs.realpath(path.join(publicRoot, name)).catch(() => null)))
  if (!roots.some((root) => { const relative = root && path.relative(root, real); return root && relative && !relative.startsWith('..') && !path.isAbsolute(relative) })) return null
  const stat = await fs.stat(real)
  if (!stat.isFile()) return null
  const key = crypto.createHash('sha256').update(`${real}:${stat.size}:${stat.mtimeMs}`).digest('hex')
  const output = path.join(cacheRoot, `${key}.webp`)
  if (await fs.stat(output).then(() => true).catch(() => false)) return output
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      if (waiting.length >= 20) throw new Error('Thumbnail queue full.')
      if (running >= 2) await new Promise((resolve) => waiting.push(resolve))
      running += 1
      const temporary = path.join(cacheRoot, `${key}.part.webp`)
      try {
        await fs.mkdir(cacheRoot, { recursive: true })
        await execute('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '1', '-protocol_whitelist', 'file', '-i', real, '-vf', 'scale=480:320:force_original_aspect_ratio=decrease', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '75', '-threads', '1', temporary], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 })
        await fs.rename(temporary, output)
        return output
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => {})
        running -= 1
        waiting.shift()?.()
      }
    })().finally(() => pending.delete(key)))
  }
  return pending.get(key)
}
