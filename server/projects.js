import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCENES = path.join(__dirname, 'data', 'scenes.json')
const ASSET_KEYS = new Set(['src','image','imageUrl','video','videoUrl','audio','audioUrl','model','modelUrl','icon','iconUrl','thumbnail','manifestUrl'])

function collect(value, set) {
  if (Array.isArray(value)) return value.forEach((x) => collect(x, set))
  if (!value || typeof value !== 'object') return
  for (const [k, v] of Object.entries(value)) typeof v === 'string' && ASSET_KEYS.has(k) && v.trim() ? set.add(v.trim()) : collect(v, set)
}

export function createProjectsRouter(express) {
  const router = express.Router()
  router.get('/:projectId/manifest', (req, res) => {
    if (req.params.projectId !== 'default') return res.status(404).json({ error: 'Project not found' })
    try {
      const scenes = JSON.parse(fs.readFileSync(SCENES, 'utf8')); const assets = new Set(); collect(scenes, assets)
      const revision = crypto.createHash('sha256').update(JSON.stringify(scenes)).digest('hex').slice(0,16)
      res.set('Cache-Control','no-store').json({ schemaVersion: 1, id: 'default', title: '3DVR Project', revision, startSceneId: scenes[0]?.id || null, scenes, assets: [...assets] })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
  return router
}
