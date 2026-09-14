import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { readImageMetadata, validateEquirectangular } from './imageMetadata.js'
import { writePanoramaJob } from './panoramaJobs.js'
import { INCOMING_ROOT, MASTER_ROOT } from './storagePaths.js'
import { requireEditor } from './auth.js'

const DEFAULT_CHUNK_SIZE = 16 * 1024 * 1024
const MAX_CHUNK_SIZE = 64 * 1024 * 1024

async function ensureDirs() { await fs.mkdir(INCOMING_ROOT, { recursive: true }); await fs.mkdir(MASTER_ROOT, { recursive: true }) }
function assertId(id) { if (!/^[0-9a-f-]{36}$/i.test(id)) { const e = new Error('Invalid upload id'); e.status = 400; throw e } }
const metaPath = (id) => path.join(INCOMING_ROOT, `${id}.json`)
const partPath = (id) => path.join(INCOMING_ROOT, `${id}.part`)
async function readUpload(id) { assertId(id); return JSON.parse(await fs.readFile(metaPath(id), 'utf8')) }
async function writeUpload(record) { const target = metaPath(record.id); const temp = `${target}.${process.pid}.tmp`; await fs.writeFile(temp, JSON.stringify(record, null, 2)); await fs.rename(temp, target) }
async function sizeOf(file) { try { return (await fs.stat(file)).size } catch (e) { if (e.code === 'ENOENT') return 0; throw e } }
function ext(format) { return format === 'jpeg' ? '.jpg' : format === 'png' ? '.png' : format === 'webp' ? '.webp' : '' }

export function createPanoramaUploadsRouter(express) {
  const router = express.Router()
  const rawChunk = express.raw({ type: ['application/offset+octet-stream', 'application/octet-stream'], limit: MAX_CHUNK_SIZE })

  router.post('/', requireEditor, async (req, res) => {
    await ensureDirs()
    const expectedSize = Number(req.body?.size)
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) return res.status(400).json({ error: 'Valid file size required.' })
    const id = crypto.randomUUID()
    const record = { id, filename: path.basename(String(req.body?.filename || 'panorama')).replace(/[^a-zA-Z0-9._-]/g, '_'), mimeType: String(req.body?.mimeType || ''), expectedSize, offset: 0, status: 'uploading', createdAt: new Date().toISOString() }
    await fs.writeFile(partPath(id), Buffer.alloc(0), { flag: 'wx' }); await writeUpload(record)
    res.status(201).set('Upload-Offset', '0').json({ uploadId: id, chunkSize: DEFAULT_CHUNK_SIZE, offset: 0 })
  })

  router.head('/:uploadId', requireEditor, async (req, res) => {
    try { const record = await readUpload(req.params.uploadId); const offset = await sizeOf(partPath(record.id)); res.set('Upload-Offset', String(offset)).set('Upload-Length', String(record.expectedSize)).set('Upload-Status', record.status).status(204).end() }
    catch (e) { res.status(e.code === 'ENOENT' ? 404 : e.status || 500).end() }
  })

  router.patch('/:uploadId', requireEditor, rawChunk, async (req, res) => {
    try {
      const record = await readUpload(req.params.uploadId)
      const actualOffset = await sizeOf(partPath(record.id)); const clientOffset = Number(req.get('Upload-Offset'))
      if (record.status !== 'uploading') return res.status(409).json({ error: `Upload is ${record.status}.` })
      if (clientOffset !== actualOffset) return res.status(409).set('Upload-Offset', String(actualOffset)).json({ error: 'Offset mismatch.' })
      if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Empty chunk.' })
      if (actualOffset + req.body.length > record.expectedSize) return res.status(413).json({ error: 'Chunk exceeds declared file size.' })
      await fs.appendFile(partPath(record.id), req.body); record.offset = actualOffset + req.body.length; record.updatedAt = new Date().toISOString(); await writeUpload(record)
      res.set('Upload-Offset', String(record.offset)).status(204).end()
    } catch (e) { res.status(e.code === 'ENOENT' ? 404 : e.status || 500).json({ error: e.message }) }
  })

  router.post('/:uploadId/complete', requireEditor, async (req, res) => {
    try {
      const record = await readUpload(req.params.uploadId); const part = partPath(record.id); const actualSize = await sizeOf(part)
      if (actualSize !== record.expectedSize) return res.status(409).json({ error: 'Upload incomplete.', expectedSize: record.expectedSize, actualSize })
      const metadata = await readImageMetadata(part); const projection = validateEquirectangular(metadata)
      if (!projection.valid) return res.status(422).json({ error: projection.reason, metadata })
      const master = path.join(MASTER_ROOT, `${record.id}${ext(metadata.format)}`); await fs.rename(part, master)
      const jobId = crypto.randomUUID(); const job = { id: jobId, type: 'panorama-pyramid', status: 'queued', createdAt: new Date().toISOString(), source: { uploadId: record.id, filename: record.filename, storagePath: master, byteSize: actualSize, ...metadata, projection: 'equirectangular' }, output: { assetId: record.id, tileSize: 512, quality: Number(process.env.PANORAMA_WEBP_QUALITY || 94), format: 'webp' } }
      await writePanoramaJob(job); Object.assign(record, { status: 'uploaded', offset: actualSize, masterPath: master, metadata, jobId, updatedAt: new Date().toISOString() }); await writeUpload(record)
      res.status(201).json({ uploadId: record.id, jobId, status: 'queued', panorama: { ...metadata, projection: 'equirectangular', byteSize: actualSize } })
    } catch (e) { res.status(e.code === 'ENOENT' ? 404 : e.status || 500).json({ error: e.message }) }
  })

  return router
}
