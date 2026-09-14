import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireEditor } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCENES_PATH = path.join(__dirname, 'data', 'scenes.json')

async function readScenes() {
  return JSON.parse(await fs.readFile(SCENES_PATH, 'utf8'))
}

async function writeScenes(scenes) {
  const temp = `${SCENES_PATH}.${process.pid}.tmp`
  await fs.writeFile(temp, JSON.stringify(scenes, null, 2))
  await fs.rename(temp, SCENES_PATH)
}

export function createScenesRouter(express) {
  const router = express.Router()

  router.get('/', async (_req, res) => {
    try {
      res.set('Cache-Control', 'no-store')
      res.json(await readScenes())
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  router.put('/', requireEditor, async (req, res) => {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Scenes must be an array.' })
    try {
      await writeScenes(req.body)
      res.json({ ok: true })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  return router
}
