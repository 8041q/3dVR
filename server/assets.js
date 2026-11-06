import { MEDIA_ROOT } from './storagePaths.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireEditor } from './auth.js'
import { assetRegistryByUrl, removeAssetFromRegistry } from './assetRegistry.js'
import { findAssetReferences } from './assetReferences.js'
import { assetThumbnail, cachedModelThumbnail, saveModelThumbnail } from './assetThumbnails.js'
import { rateLimit } from 'express-rate-limit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const publicRoot = MEDIA_ROOT
const uploadsRoot = path.join(publicRoot, 'uploads')
const demoRoot = path.join(publicRoot, 'demo')
const thumbnailRoot = path.join(MEDIA_ROOT, '..', 'thumbnails')
const thumbnailUrl = (asset) => `/api/assets/thumbnail?url=${encodeURIComponent(asset.url)}&v=${encodeURIComponent(asset.updatedAt)}`

const TYPE_BY_EXTENSION = new Map([
  ['.jpg', 'image'], ['.jpeg', 'image'], ['.png', 'image'], ['.webp', 'image'],
  ['.glb', 'model'], ['.gltf', 'model'],
  ['.mp3', 'audio'], ['.wav', 'audio'], ['.ogg', 'audio'],
  ['.mp4', 'video'], ['.webm', 'video'],
])

function toPublicUrl(filePath) {
  const relative = path.relative(publicRoot, filePath).split(path.sep).join('/')
  return `/${relative}`
}

export function uploadFilenameFromUrl(url) {
  const value = String(url || '').trim()
  if (!value.startsWith('/uploads/')) return null

  const encodedName = value.slice('/uploads/'.length)
  let filename
  try {
    filename = decodeURIComponent(encodedName)
  } catch {
    return null
  }

  if (!filename || filename !== path.basename(filename) || filename.includes('/') || filename.includes('\\')) {
    return null
  }
  return filename
}

async function walk(directory, source) {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const output = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const absolute = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      output.push(...await walk(absolute, source))
      continue
    }

    const extension = path.extname(entry.name).toLowerCase()
    const type = TYPE_BY_EXTENSION.get(extension)
    if (!type) continue

    const stat = await fs.stat(absolute)
    output.push({
      name: entry.name,
      url: toPublicUrl(absolute),
      type,
      extension,
      bytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
      source,
    })
  }

  return output
}

export function createAssetsRouter(express) {
  const router = express.Router()

  router.get('/thumbnail', async (req, res) => {
    try {
      const thumbnail = /\.(glb|gltf)$/i.test(String(req.query.url))
        ? await cachedModelThumbnail(req.query.url, publicRoot, thumbnailRoot)
        : await assetThumbnail(req.query.url, publicRoot, thumbnailRoot)
      if (!thumbnail) return res.sendStatus(404)
      res.set('Cache-Control', 'private, no-store')
      return res.sendFile(path.basename(thumbnail), { root: path.dirname(thumbnail) })
    } catch {
      res.set('Cache-Control', 'no-store')
      return res.type('svg').send('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" text-anchor="middle" fill="#667085" font-family="sans-serif" font-size="18">Open file to preview</text></svg>')
    }
  })

  router.post('/model-thumbnail', requireEditor, rateLimit({ windowMs: 60000, limit: 120 }), express.raw({ type: 'image/webp', limit: '256kb', inflate: false }), async (req, res) => {
    try {
      const saved = await saveModelThumbnail(String(req.query.url || ''), String(req.query.v || ''), req.body, publicRoot, thumbnailRoot)
      const revision = (await fs.stat(saved)).mtimeMs
      return res.json({ thumbnailUrl: `${thumbnailUrl({ url: String(req.query.url), updatedAt: String(req.query.v) })}&capture=${revision}` })
    } catch (error) {
      const status = error.status || 500
      return res.status(status).json({ error: status < 500 ? error.message : 'Could not save the thumbnail. Check that FFmpeg is installed on the server.' })
    }
  })

  router.get('/', async (_req, res) => {
    try {
      const [uploads, demo, registry] = await Promise.all([
        walk(uploadsRoot, 'upload'),
        walk(demoRoot, 'demo'),
        assetRegistryByUrl(),
      ])

      const enrichedUploads = uploads.map((asset) => {
        const metadata = registry.get(asset.url)
        if (!metadata) return asset
        return {
          ...asset,
          name: metadata.originalName || asset.name,
          storedName: metadata.storedName || asset.name,
          originalName: metadata.originalName || asset.name,
        }
      })

      const assets = [...enrichedUploads, ...demo]
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))

      await Promise.all(assets.filter(asset => asset.type === 'model').map(async asset => {
        if (await cachedModelThumbnail(asset.url, publicRoot, thumbnailRoot)) asset.thumbnailUrl = thumbnailUrl(asset)
      }))

      res.set('Cache-Control', 'no-store')
      return res.json(assets)
    } catch (error) {
      console.error('[assets]', error)
      return res.status(500).json({ error: 'Could not list assets' })
    }
  })

  router.delete('/', requireEditor, async (req, res) => {
    try {
      const url = String(req.query?.url || '').trim()
      const filename = uploadFilenameFromUrl(url)
      if (!filename) {
        return res.status(400).json({ error: 'Only files in /uploads can be deleted.' })
      }

      const references = await findAssetReferences(url)
      if (references.length) {
        return res.status(409).json({
          error: 'Asset is still referenced. Remove it from the project and saved revisions before deleting it.',
          references,
        })
      }

      const registryRecord = await removeAssetFromRegistry(url)
      const filePath = path.join(uploadsRoot, filename)
      let fileDeleted = false
      try {
        await fs.unlink(filePath)
        fileDeleted = true
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }

      return res.json({
        ok: true,
        url,
        fileDeleted,
        registryDeleted: Boolean(registryRecord),
      })
    } catch (error) {
      console.error('[assets:delete]', error)
      return res.status(500).json({ error: 'Could not delete asset' })
    }
  })

  return router
}
