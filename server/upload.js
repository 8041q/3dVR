import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { requireEditor } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS = path.join(__dirname, '..', 'public', 'uploads')
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp',
  '.glb',
  '.mp3', '.wav', '.ogg',
  '.mp4', '.webm',
])

function safeExtension(filename = '') {
  const ext = path.extname(path.basename(filename)).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) return null
  return ext === '.jpeg' ? '.jpg' : ext
}

export function createUploadRouter(express) {
  const router = express.Router()

  router.post('/', requireEditor, async (req, res) => {
    await fsPromises.mkdir(UPLOADS, { recursive: true })

    const filename = String(req.get('X-Filename') || 'asset')
    const extension = safeExtension(filename)
    if (!extension) {
      return res.status(415).json({
        error: 'Unsupported asset type. Use JPEG, PNG, WebP, GLB, MP3, WAV, OGG, MP4 or WebM.',
      })
    }

    const configuredMax = Number(process.env.MAX_ASSET_UPLOAD_BYTES || DEFAULT_MAX_BYTES)
    const declaredBytes = Number(req.get('Content-Length') || 0)
    if (Number.isFinite(configuredMax) && configuredMax > 0 && declaredBytes > configuredMax) {
      return res.status(413).json({ error: 'Asset exceeds the configured upload size.' })
    }

    const name = `${crypto.randomUUID()}${extension}`
    const finalPath = path.join(UPLOADS, name)
    const tempPath = `${finalPath}.${process.pid}.part`
    const writeStream = fs.createWriteStream(tempPath, { flags: 'wx' })
    let written = 0
    let failed = false

    const cleanup = async () => {
      await fsPromises.rm(tempPath, { force: true }).catch(() => {})
    }

    req.on('data', (chunk) => {
      written += chunk.length
      if (Number.isFinite(configuredMax) && configuredMax > 0 && written > configuredMax && !failed) {
        failed = true
        req.unpipe(writeStream)
        writeStream.destroy()
        req.resume()
        cleanup().finally(() => {
          if (!res.headersSent) res.status(413).json({ error: 'Asset exceeds the configured upload size.' })
        })
      }
    })

    req.on('aborted', () => {
      failed = true
      writeStream.destroy()
      cleanup()
    })

    req.on('error', async (error) => {
      failed = true
      writeStream.destroy()
      await cleanup()
      if (!res.headersSent) res.status(400).json({ error: error.message || 'Asset upload interrupted.' })
    })

    writeStream.on('error', async (error) => {
      failed = true
      await cleanup()
      if (!res.headersSent) res.status(500).json({ error: error.message || 'Asset upload failed.' })
    })

    writeStream.on('finish', async () => {
      if (failed) return
      try {
        await fsPromises.rename(tempPath, finalPath)
        return res.status(201).json({
          url: `/uploads/${name}`,
          bytes: written,
          filename: name,
          contentType: req.get('Content-Type') || 'application/octet-stream',
        })
      } catch (error) {
        await cleanup()
        if (!res.headersSent) res.status(500).json({ error: error.message || 'Asset upload failed.' })
      }
    })

    req.pipe(writeStream)
  })

  return router
}
