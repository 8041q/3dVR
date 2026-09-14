import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireEditor } from './auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GUIDES_PATH = path.join(__dirname, 'data', 'guides.json')

async function readGuides() {
  try {
    return JSON.parse(await fs.readFile(GUIDES_PATH, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function writeGuides(guides) {
  const temp = `${GUIDES_PATH}.${process.pid}.tmp`
  await fs.writeFile(temp, JSON.stringify(guides, null, 2))
  await fs.rename(temp, GUIDES_PATH)
}

export function createGuidesRouter(express) {
  const router = express.Router()

  router.get('/', async (_req, res) => {
    try {
      res.set('Cache-Control', 'no-store')
      res.json(await readGuides())
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  router.put('/', requireEditor, async (req, res) => {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Guides must be an array.' })
    }

    try {
      await writeGuides(req.body)
      res.json({ ok: true })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  return router
}
