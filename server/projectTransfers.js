import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { requireEditor } from './auth.js'
import { createProjectBundleService, bundleError } from './projectBundles.js'
import { INCOMING_ROOT } from './storagePaths.js'

function sizeLimit(name, fallback) {
  const value = Number(process.env[name])
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

async function receiveZip(request, file, limit) {
  if (Number(request.get('Content-Length')) > limit) throw bundleError('The project ZIP exceeds the server upload limit.', 413)
  const handle = await fs.open(file, 'wx')
  let bytes = 0
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      bytes += chunk.length
      if (bytes > limit) throw bundleError('The project ZIP exceeds the server upload limit.', 413)
      await handle.writeFile(chunk)
    }
    if (!bytes) throw bundleError('Choose a non-empty project ZIP.')
  } finally { await handle.close() }
}

export function createProjectTransfersRouter(express, { service = createProjectBundleService(), tempRoot = INCOMING_ROOT } = {}) {
  const router = express.Router()
  const downloads = new Map()
  function sendError(res, error) {
    if (!error.status || error.status >= 500) console.error('[project-transfer]', error)
    if (!res.headersSent && !res.destroyed) res.status(error.status || 500).json({ error: error.message || 'Project transfer failed.' })
  }

  router.post('/export/:projectId', requireEditor, async (req, res) => {
    try {
      const { draft, expectedDraftRevision } = req.body || {}
      if (draft && (!Array.isArray(draft.scenes) || !Array.isArray(draft.guides) || typeof expectedDraftRevision !== 'string')) throw bundleError('Exporting unsaved edits requires a complete draft and its base revision.')
      const plan = await service.prepareExport(req.params.projectId, { draft, expectedDraftRevision })
      const ticket = crypto.randomBytes(32).toString('hex')
      const timer = setTimeout(() => downloads.delete(ticket), 10 * 60 * 1000)
      timer.unref()
      downloads.set(ticket, { plan, timer })
      res.set('Cache-Control', 'no-store').json({ downloadUrl: `/api/project-transfers/download/${ticket}`, filename: plan.filename, fileCount: plan.fileCount, externalAssets: plan.externalAssets })
    } catch (error) { sendError(res, error) }
  })

  // A short-lived, single-use ticket allows the browser's native downloader to
  // stream large ZIPs to disk without retaining the entire project in memory.
  router.get('/download/:ticket', async (req, res) => {
    const download = downloads.get(req.params.ticket)
    if (!download) return res.status(404).json({ error: 'This download expired. Export the project again.' })
    downloads.delete(req.params.ticket)
    clearTimeout(download.timer)
    res.set('Cache-Control', 'no-store')
    res.set('Referrer-Policy', 'no-referrer')
    res.type('application/zip').attachment(download.plan.filename)
    try { await service.writeExport(download.plan, res) }
    catch (error) { sendError(res, error); if (!res.destroyed) res.destroy() }
  })

  router.post('/import', requireEditor, async (req, res) => {
    let stage
    try {
      if (!req.is(['application/zip', 'application/x-zip-compressed', 'application/octet-stream'])) throw bundleError('Upload a project ZIP file.', 415)
      await fs.mkdir(tempRoot, { recursive: true })
      stage = await fs.mkdtemp(path.join(tempRoot, 'project-upload-'))
      const file = path.join(stage, 'project.zip')
      await receiveZip(req, file, sizeLimit('MAX_PROJECT_IMPORT_BYTES', 10 * 1024 ** 3))
      const result = await service.importArchive(file, { maxBytes: sizeLimit('MAX_PROJECT_EXTRACT_BYTES', 20 * 1024 ** 3) })
      res.status(201).json(result)
    } catch (error) { req.resume(); sendError(res, error) }
    finally { if (stage) await fs.rm(stage, { recursive: true, force: true }).catch(() => {}) }
  })
  return router
}
