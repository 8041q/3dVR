import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { createAuthRouter } from './auth.js'
import { createScenesRouter } from './scenes.js'
import { createUploadRouter } from './upload.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const app = express()

app.use(cors({ origin: ['http://localhost:5173', 'https://localhost:5173'], credentials: false }))
app.use(express.json({ limit: '1mb' }))

// Serve uploaded panoramas statically
app.use('/uploads', express.static(uploadsDir))

// API routes
app.use('/api/auth', createAuthRouter(express))
app.use('/api/scenes', createScenesRouter(express))
app.use('/api/upload', createUploadRouter(express))

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }))

const PORT = parseInt(process.env.PORT || '3001', 10)
app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
