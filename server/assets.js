import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const publicRoot = path.join(repoRoot, 'public')
const uploadsRoot = path.join(publicRoot, 'uploads')
const demoRoot = path.join(publicRoot, 'demo')

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

  router.get('/', async (_req, res) => {
    try {
      const [uploads, demo] = await Promise.all([
        walk(uploadsRoot, 'upload'),
        walk(demoRoot, 'demo'),
      ])

      const assets = [...uploads, ...demo]
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))

      res.set('Cache-Control', 'no-store')
      return res.json(assets)
    } catch (error) {
      console.error('[assets]', error)
      return res.status(500).json({ error: error.message || 'Could not list assets' })
    }
  })

  return router
}
