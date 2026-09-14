import fs from 'node:fs/promises'
import path from 'node:path'
import { JOB_ROOT } from './storagePaths.js'

function assertJobId(jobId) {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    const error = new Error('Invalid panorama job id')
    error.status = 400
    throw error
  }
}

function jobPath(jobId) {
  assertJobId(jobId)
  return path.join(JOB_ROOT, `${jobId}.json`)
}

export async function ensureJobRoot() { await fs.mkdir(JOB_ROOT, { recursive: true }) }

export async function readPanoramaJob(jobId) {
  return JSON.parse(await fs.readFile(jobPath(jobId), 'utf8'))
}

export async function writePanoramaJob(job) {
  await ensureJobRoot()
  const target = jobPath(job.id)
  const temp = `${target}.${process.pid}.tmp`
  await fs.writeFile(temp, JSON.stringify(job, null, 2))
  await fs.rename(temp, target)
  return job
}

export async function patchPanoramaJob(jobId, patch) {
  const current = await readPanoramaJob(jobId)
  return writePanoramaJob({ ...current, ...patch, updatedAt: new Date().toISOString() })
}

export async function listPanoramaJobs() {
  await ensureJobRoot()
  const result = []
  for (const name of (await fs.readdir(JOB_ROOT)).filter((x) => x.endsWith('.json')).sort()) {
    try { result.push(JSON.parse(await fs.readFile(path.join(JOB_ROOT, name), 'utf8'))) } catch {}
  }
  return result
}

export function createPanoramaJobsRouter(express) {
  const router = express.Router()
  router.get('/:jobId', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store')
      res.json(await readPanoramaJob(req.params.jobId))
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).json({ error: 'Job not found' })
      res.status(error.status || 500).json({ error: error.message })
    }
  })
  return router
}
