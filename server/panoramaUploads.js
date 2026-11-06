import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { readImageMetadata, validateEquirectangular } from './imageMetadata.js'
import { readPanoramaJob, writePanoramaJob } from './panoramaJobs.js'
import { INCOMING_ROOT, MASTER_ROOT } from './storagePaths.js'
import { requireEditor } from './auth.js'

const DEFAULT_CHUNK_SIZE = 16 * 1024 * 1024
const MAX_CHUNK_SIZE = 64 * 1024 * 1024
const uploadOperations = new Map()

function withUpload(id, operation) {
  assertId(id)
  const previous = uploadOperations.get(id) || Promise.resolve()
  const result = previous.then(operation)
  const tail = result.catch(() => {})
  uploadOperations.set(id, tail)
  return result.finally(() => {
    if (uploadOperations.get(id) === tail) uploadOperations.delete(id)
  })
}

async function ensureDirs() { await fs.mkdir(INCOMING_ROOT, { recursive: true }); await fs.mkdir(MASTER_ROOT, { recursive: true }) }
function assertId(id) { if (!/^[0-9a-f-]{36}$/i.test(id)) { const e = new Error('Invalid upload id'); e.status = 400; throw e } }
const metaPath = (id) => path.join(INCOMING_ROOT, `${id}.json`)
const partPath = (id) => path.join(INCOMING_ROOT, `${id}.part`)
async function readUpload(id) { assertId(id); return JSON.parse(await fs.readFile(metaPath(id), 'utf8')) }
async function writeUpload(record) { const target = metaPath(record.id); const temp = `${target}.${process.pid}.tmp`; await fs.writeFile(temp, JSON.stringify(record, null, 2)); await fs.rename(temp, target) }
async function sizeOf(file) { try { return (await fs.stat(file)).size } catch (e) { if (e.code === 'ENOENT') return 0; throw e } }
function ext(format) { return format === 'jpeg' ? '.jpg' : format === 'png' ? '.png' : format === 'webp' ? '.webp' : '' }

async function uploadOffset(record) {
  if (record.status === 'uploaded') return record.expectedSize
  if (record.finalization && await sizeOf(record.finalization.masterPath) === record.expectedSize) return record.expectedSize
  return sizeOf(partPath(record.id))
}

async function finishUpload(record) {
  if (record.jobId) return readPanoramaJob(record.jobId)

  if (!record.finalization) {
    const part = partPath(record.id)
    const actualSize = await sizeOf(part)
    if (actualSize !== record.expectedSize) {
      throw Object.assign(new Error('Upload incomplete.'), { status: 409 })
    }
    const metadata = await readImageMetadata(part)
    const projection = validateEquirectangular(metadata)
    if (!projection.valid) throw Object.assign(new Error(projection.reason), { status: 422 })
    record.finalization = { metadata, masterPath: path.join(MASTER_ROOT, `${record.id}${ext(metadata.format)}`) }
    await writeUpload(record)
  }

  // Record the destination before moving the file. A lost response or API
  // restart can continue this operation without creating another job.
  const { masterPath, metadata } = record.finalization
  if (await sizeOf(masterPath) !== record.expectedSize) {
    await fs.rename(partPath(record.id), masterPath)
  }
  let job
  try {
    job = await readPanoramaJob(record.id)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    job = await writePanoramaJob({
      id: record.id,
      type: 'panorama-pyramid',
      status: 'queued',
      createdAt: new Date().toISOString(),
      source: {
        uploadId: record.id,
        filename: record.filename,
        storagePath: masterPath,
        byteSize: record.expectedSize,
        ...metadata,
        projection: 'equirectangular',
      },
      output: { assetId: record.id, tileSize: 512, quality: Number(process.env.PANORAMA_WEBP_QUALITY || 94), format: 'webp' },
    })
  }
  Object.assign(record, {
    status: 'uploaded',
    offset: record.expectedSize,
    masterPath,
    metadata,
    jobId: job.id,
    updatedAt: new Date().toISOString(),
  })
  delete record.finalization
  await writeUpload(record)
  return job
}

export function createPanoramaUploadsRouter(express) {
  const router = express.Router()
  const rawChunk = express.raw({ type: ['application/offset+octet-stream', 'application/octet-stream'], limit: MAX_CHUNK_SIZE })

  router.post('/', requireEditor, async (req, res) => {
    await ensureDirs()
    const expectedSize = Number(req.body?.size)
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > (Number(process.env.MAX_ASSET_UPLOAD_BYTES) || 2147483648)) return res.status(400).json({ error: 'Valid file size required.' })
    const id = crypto.randomUUID()
    const record = { id, filename: path.basename(String(req.body?.filename || 'panorama')).replace(/[^a-zA-Z0-9._-]/g, '_'), mimeType: String(req.body?.mimeType || ''), expectedSize, offset: 0, status: 'uploading', createdAt: new Date().toISOString() }
    await fs.writeFile(partPath(id), Buffer.alloc(0), { flag: 'wx' }); await writeUpload(record)
    res.status(201).set('Upload-Offset', '0').json({ uploadId: id, chunkSize: DEFAULT_CHUNK_SIZE, offset: 0 })
  })

  router.head('/:uploadId', requireEditor, async (req, res) => {
    try {
      await withUpload(req.params.uploadId, async () => {
        const record = await readUpload(req.params.uploadId)
        res.set('Cache-Control', 'no-store')
          .set('Upload-Offset', String(await uploadOffset(record)))
          .set('Upload-Length', String(record.expectedSize))
          .set('Upload-Chunk-Size', String(DEFAULT_CHUNK_SIZE))
          .set('Upload-Status', record.status).status(204).end()
      })
    } catch (error) {
      res.status(error.code === 'ENOENT' ? 404 : error.status || 500).end()
    }
  })

  router.patch('/:uploadId', requireEditor, rawChunk, async (req, res) => {
    try {
      await withUpload(req.params.uploadId, async () => {
        const record = await readUpload(req.params.uploadId)
        const actualOffset = await uploadOffset(record)
        const offsetHeader = req.get('Upload-Offset')
        if (!/^\d+$/.test(offsetHeader || '')) return res.status(400).json({ error: 'A valid upload offset is required.' })
        if (Number(offsetHeader) !== actualOffset) {
          return res.status(409).set('Upload-Offset', String(actualOffset)).json({ error: 'Offset mismatch.' })
        }
        if (record.status !== 'uploading' || record.finalization) return res.status(409).json({ error: 'Upload is already complete.' })
        if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Empty chunk.' })
        if (actualOffset + req.body.length > record.expectedSize) return res.status(413).json({ error: 'Chunk exceeds declared file size.' })
        await fs.appendFile(partPath(record.id), req.body)
        await fs.utimes(metaPath(record.id),new Date(),new Date())
        res.set('Upload-Offset', String(actualOffset + req.body.length)).status(204).end()
      })
    } catch (e) { res.status(e.code === 'ENOENT' ? 404 : e.status || 500).json({ error: e.status && e.status < 500 ? e.message : 'Operation failed.' }) }
  })

  router.post('/:uploadId/complete', requireEditor, async (req, res) => {
    try {
      await withUpload(req.params.uploadId, async () => {
        const record = await readUpload(req.params.uploadId)
        const repeated = Boolean(record.jobId)
        const job = await finishUpload(record)
        res.status(repeated ? 200 : 201).json({
          uploadId: record.id,
          jobId: job.id,
          status: job.status,
          panorama: { ...record.metadata, projection: 'equirectangular', byteSize: record.expectedSize },
        })
      })
    } catch (e) { res.status(e.code === 'ENOENT' ? 404 : e.status || 500).json({ error: e.status && e.status < 500 ? e.message : 'Operation failed.' }) }
  })

  return router
}
