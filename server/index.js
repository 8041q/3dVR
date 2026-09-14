import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuthRouter } from './auth.js'
import { createScenesRouter } from './scenes.js'
import { createUploadRouter } from './upload.js'
import { createProjectsRouter } from './projects.js'
import { createGuidesRouter } from './guides.js'
import { createAssetsRouter } from './assets.js'
import { createPanoramaUploadsRouter } from './panoramaUploads.js'
import { createPanoramaJobsRouter } from './panoramaJobs.js'
import { PANORAMA_ROOT } from './storagePaths.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const uploads = path.join(repoRoot, 'public', 'uploads')
const distRoot = path.join(repoRoot, 'dist')

fs.mkdirSync(uploads, { recursive: true })
fs.mkdirSync(PANORAMA_ROOT, { recursive: true })

const app = express()

app.disable('x-powered-by')
app.use(cors({ origin: true, credentials: false }))
app.use(express.json({ limit: '1mb' }))

app.use('/uploads', express.static(uploads, { maxAge: 0 }))
app.use('/media/panoramas', express.static(PANORAMA_ROOT, {
  immutable: true,
  maxAge: '365d',
  etag: true,
}))

app.use('/api/auth', createAuthRouter(express))
app.use('/api/scenes', createScenesRouter(express))
app.use('/api/upload', createUploadRouter(express))
app.use('/api/assets', createAssetsRouter(express))
app.use('/api/projects', createProjectsRouter(express))
app.use('/api/guides', createGuidesRouter(express))
app.use('/api/panorama-uploads', createPanoramaUploadsRouter(express))
app.use('/api/panorama-jobs', createPanoramaJobsRouter(express))
app.get('/api/health', (_req, res) => res.json({ ok: true }))

// In production the API also serves the built viewer/editor. Vite is only a
// development server, so a deployed installation needs one public web process.
if (fs.existsSync(path.join(distRoot, 'index.html'))) {
  app.use(express.static(distRoot, {
    index: false,
    etag: true,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  }))

  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    if (req.path.startsWith('/api/') || req.path.startsWith('/media/') || req.path.startsWith('/uploads/')) {
      return next()
    }

    const acceptsHtml = (req.get('Accept') || '').includes('text/html')
    if (!acceptsHtml) return next()
    res.setHeader('Cache-Control', 'no-cache')
    return res.sendFile(path.join(distRoot, 'index.html'))
  })
}

const PORT = Number(process.env.PORT || 3001)
const server = app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`)
  if (fs.existsSync(path.join(distRoot, 'index.html'))) {
    console.log('[server] serving production client from ./dist')
  } else {
    console.log('[server] ./dist not found; use Vite for the development client')
  }
})

function shutdown(signal) {
  console.log(`[server] ${signal}; shutting down`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
