import crypto from 'node:crypto'
import { MEDIA_ROOT } from './storagePaths.js'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireEditor } from './auth.js'
import { chooseStoredFilename, sanitizeUploadFilename } from './assetStorage.js'
import { registerAsset } from './assetRegistry.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS = path.join(MEDIA_ROOT, 'uploads')
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

    const configuredMax = Math.max(1, Number(process.env.MAX_ASSET_UPLOAD_BYTES) || DEFAULT_MAX_BYTES)
    const declaredBytes = Number(req.get('Content-Length') || 0)
    if (Number.isFinite(configuredMax) && configuredMax > 0 && declaredBytes > configuredMax) {
      return res.status(413).json({ error: 'Asset exceeds the configured upload size.' })
    }

    const originalName = sanitizeUploadFilename(filename, extension)
    const name = await chooseStoredFilename(UPLOADS, originalName, extension)
    const finalPath = path.join(UPLOADS, name)
    const tempPath = `${finalPath}.${crypto.randomUUID()}.part`
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
      if (!res.headersSent) res.status(error.status || 500).json({ error: error.status && error.status < 500 ? error.message : 'Asset upload failed.' })
    })

    writeStream.on('finish', async () => {
      if (failed) return
      try {
        await validateMedia(tempPath,extension)
        // Hard links create the final file exclusively; concurrent uploads cannot overwrite.
        await fsPromises.link(tempPath, finalPath)
        await fsPromises.unlink(tempPath)
        const contentType = req.get('Content-Type') || 'application/octet-stream'
        const url = `/uploads/${name}`
        await registerAsset({
          url,
          originalName,
          storedName: name,
          bytes: written,
          contentType,
          uploadedAt: new Date().toISOString(),
        })
        return res.status(201).json({
          url,
          updatedAt: (await fsPromises.stat(finalPath)).mtime.toISOString(),
          bytes: written,
          filename: name,
          storedName: name,
          originalName,
          contentType,
        })
      } catch (error) {
        await cleanup()
        if (!res.headersSent) res.status(error.status || 500).json({ error: error.status && error.status < 500 ? error.message : 'Asset upload failed.' })
      }
    })

    req.pipe(writeStream)
  })

  return router
}

async function validateMedia(file,extension) {
  const handle = await fsPromises.open(file,'r')
  const buffer = Buffer.alloc(16)
  try { await handle.read(buffer,0,16,0) } finally {await handle.close()}
  const hex=buffer.toString('hex'), text=buffer.toString('ascii')
  const valid = { '.jpg':hex.startsWith('ffd8ff'), '.png':hex.startsWith('89504e470d0a1a0a'), '.webp':text.startsWith('RIFF') && text.slice(8,12)==='WEBP', '.glb':text.startsWith('glTF') && buffer.readUInt32LE(4)===2, '.wav':text.startsWith('RIFF') && text.slice(8,12)==='WAVE', '.ogg':text.startsWith('OggS'), '.mp3':text.startsWith('ID3') || (buffer[0]===255 && (buffer[1]&224)===224), '.mp4':text.slice(4,8)==='ftyp', '.webm':hex.startsWith('1a45dfa3') }
  if (!valid[extension]) throw Object.assign(new Error('File content does not match its extension.'),{status:415})
}
