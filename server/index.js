import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { authHandler, createAccountsRouter, sameOrigin } from './accounts.js'
import { cleanupAbandonedUploads } from './cleanup.js'
import { purgeDeletedAccounts } from './accountLifecycle.js'
import { purgeOrphanAvatars } from './avatars.js'
import { resourceLimits } from './resourceLimits.js'
import { accessGate } from './access.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { identity } from './auth.js'
import { createScenesRouter } from './scenes.js'
import { createUploadRouter } from './upload.js'
import { createProjectsRouter } from './projects.js'
import { createProjectTransfersRouter } from './projectTransfers.js'
import { createGuidesRouter } from './guides.js'
import { createAssetsRouter } from './assets.js'
import { createPanoramaUploadsRouter } from './panoramaUploads.js'
import { createPanoramaJobsRouter } from './panoramaJobs.js'
import { PANORAMA_ROOT, MEDIA_ROOT } from './storagePaths.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const uploads = path.join(MEDIA_ROOT, 'uploads')
const distRoot = path.join(repoRoot, 'dist')

fs.mkdirSync(uploads, { recursive: true })
fs.mkdirSync(PANORAMA_ROOT, { recursive: true })

const app = express()

app.disable('x-powered-by')
app.set('trust proxy','loopback')
app.use((req,_res,next) => { req.headers['x-atria-client-ip'] = req.ip; next() })
// Authentication remains closed until local initialization is completed.
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", "'wasm-unsafe-eval'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:', 'https:'], mediaSrc: ["'self'", 'blob:', 'https:'], connectSrc: ["'self'", 'https:'], workerSrc: ["'self'", 'blob:'], objectSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginEmbedderPolicy: false }))
app.use(sameOrigin)
app.use('/api/auth', rateLimit({ windowMs:60000, limit:30 }), authHandler())
app.use(express.json({ limit: '1mb', inflate: false }))
app.use(identity)
app.use('/api',rateLimit({windowMs:60000,limit:600}))
app.use('/api/accounts', rateLimit({ windowMs:60000, limit:30 }), createAccountsRouter(express))
app.use(accessGate)
app.use(resourceLimits)


app.use('/uploads', express.static(uploads, { maxAge: 0, setHeaders: res => res.setHeader('Cache-Control','private, no-store') }))
app.use('/media/panoramas', express.static(PANORAMA_ROOT, {
  maxAge: 0,
  setHeaders: res => res.setHeader('Cache-Control','private, no-store'),
  etag: true,
}))

app.use('/api/scenes', createScenesRouter(express))
app.use('/api/upload', createUploadRouter(express))
app.use('/api/assets', createAssetsRouter(express))
app.use('/api/projects', createProjectsRouter(express))
app.use('/api/project-transfers', createProjectTransfersRouter(express))
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

app.use((error, _req, res, _next) => {
  console.error('[request]',error)
  if (!res.headersSent) res.status(error.status >= 400 && error.status < 500 ? error.status : 500).json({ error:'Request failed.' })
})
setInterval(() => cleanupAbandonedUploads().catch(error=>console.error('[cleanup]',error)),3600000).unref()
purgeDeletedAccounts().catch(error=>console.error('[account-cleanup]',error))
setInterval(()=>purgeDeletedAccounts().catch(error=>console.error('[account-cleanup]',error)),60000).unref()
purgeOrphanAvatars().catch(error=>console.error('[avatar-cleanup]',error))
setInterval(()=>purgeOrphanAvatars().catch(error=>console.error('[avatar-cleanup]',error)),3600000).unref()
const PORT = Number(process.env.PORT || 3001)
const server = app.listen(PORT, process.env.HOST || '127.0.0.1', () => {
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