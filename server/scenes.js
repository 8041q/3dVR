import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { authMiddleware } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCENES_PATH = path.join(__dirname, 'data', 'scenes.json')

function readScenes() {
  return JSON.parse(readFileSync(SCENES_PATH, 'utf8'))
}

function writeScenes(data) {
  writeFileSync(SCENES_PATH, JSON.stringify(data, null, 2), 'utf8')
}

export function createScenesRouter(express) {
  const router = express.Router()

  router.get('/', (_req, res) => {
    try {
      res.json(readScenes())
    } catch (err) {
      console.error('[scenes] read error', err)
      res.status(500).json({ error: 'Could not read scenes' })
    }
  })

  router.put('/', authMiddleware, (req, res) => {
    const data = req.body
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Body must be a scenes array' })
    }
    // Minimal schema validation
    for (const scene of data) {
      if (typeof scene.id !== 'string' || !scene.id.trim()) {
        return res.status(400).json({ error: `Invalid scene: missing id` })
      }
      if (typeof scene.title !== 'string') {
        return res.status(400).json({ error: `Scene ${scene.id}: missing title` })
      }
    }
    try {
      writeScenes(data)
      res.json({ ok: true })
    } catch (err) {
      console.error('[scenes] write error', err)
      res.status(500).json({ error: 'Could not save scenes' })
    }
  })

  return router
}
