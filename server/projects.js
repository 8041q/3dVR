import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCENES_PATH = path.join(__dirname, 'data', 'scenes.json')
const GUIDES_PATH = path.join(__dirname, 'data', 'guides.json')

const ASSET_KEYS = new Set([
  'src',
  'image',
  'imageUrl',
  'video',
  'videoUrl',
  'audio',
  'audioUrl',
  'narrationUrl',
  'model',
  'modelUrl',
  'icon',
  'iconUrl',
  'thumbnail',
  'manifestUrl',
])

function readJson(pathname, fallback) {
  try {
    return JSON.parse(readFileSync(pathname, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

function collectAssets(value, assets) {
  if (Array.isArray(value)) {
    for (const item of value) collectAssets(item, assets)
    return
  }

  if (!value || typeof value !== 'object') return

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && ASSET_KEYS.has(key) && child.trim()) {
      assets.add(child.trim())
    } else {
      collectAssets(child, assets)
    }
  }
}

function revisionForProject(scenes, guides) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ scenes, guides }))
    .digest('hex')
    .slice(0, 16)
}

function buildDefaultManifest() {
  const scenes = readJson(SCENES_PATH, [])
  const guides = readJson(GUIDES_PATH, [])
  const assets = new Set()
  collectAssets(scenes, assets)
  collectAssets(guides, assets)

  return {
    schemaVersion: 2,
    id: 'default',
    title: '3DVR Project',
    revision: revisionForProject(scenes, guides),
    startSceneId: scenes[0]?.id ?? null,
    scenes,
    guides,
    assets: [...assets],
  }
}

export function createProjectsRouter(express) {
  const router = express.Router()

  router.get('/:projectId/manifest', (req, res) => {
    if (req.params.projectId !== 'default') {
      return res.status(404).json({ error: 'Project not found' })
    }

    try {
      res.set('Cache-Control', 'no-store')
      return res.json(buildDefaultManifest())
    } catch (error) {
      console.error('[projects] manifest error', error)
      return res.status(500).json({ error: 'Could not build project manifest' })
    }
  })

  return router
}
