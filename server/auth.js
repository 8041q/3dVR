import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
})

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const token = header.slice(7)
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function createAuthRouter(express) {
  const router = express.Router()

  router.post('/login', loginLimiter, async (req, res) => {
    const { password } = req.body
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password required' })
    }

    const hash = process.env.ADMIN_PASSWORD_HASH
    if (!hash) {
      console.error('[auth] ADMIN_PASSWORD_HASH is not set in .env')
      return res.status(500).json({ error: 'Server misconfigured' })
    }

    const match = await bcrypt.compare(password, hash)
    if (!match) {
      return res.status(401).json({ error: 'Incorrect password' })
    }

    const token = jwt.sign({ role: 'editor' }, process.env.JWT_SECRET, { expiresIn: '12h' })
    return res.json({ token })
  })

  router.get('/verify', authMiddleware, (_req, res) => {
    res.json({ ok: true })
  })

  return router
}
