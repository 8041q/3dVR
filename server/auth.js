import crypto from 'node:crypto'

const editorToken = crypto.randomBytes(32).toString('hex')

function configuredPassword() {
  if (process.env.EDITOR_PASSWORD) return process.env.EDITOR_PASSWORD
  if (process.env.NODE_ENV === 'production') return null
  return 'admin'
}

export function requireEditor(req, res, next) {
  const header = req.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token !== editorToken) return res.status(401).json({ error: 'Editor authentication required.' })
  next()
}

export function createAuthRouter(express) {
  const router = express.Router()

  router.post('/login', (req, res) => {
    const password = configuredPassword()
    if (!password) {
      return res.status(503).json({ error: 'EDITOR_PASSWORD is not configured.' })
    }
    if (String(req.body?.password || '') !== password) {
      return res.status(401).json({ error: 'Incorrect password.' })
    }
    return res.json({ token: editorToken })
  })

  router.get('/session', (req, res) => {
    const header = req.get('Authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    res.json({ authenticated: token === editorToken })
  })

  return router
}
