import 'dotenv/config'
import { listPanoramaJobs, patchPanoramaJob } from './panoramaJobs.js'
import { processPanoramaJob } from './panoramaProcessor.js'

const POLL_MS = Math.max(250, Number(process.env.PANORAMA_WORKER_POLL_MS || 1500))
let stopping = false
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log('[panorama-worker] started')
  while (!stopping) {
    const jobs = await listPanoramaJobs()
    const job = jobs.find((x) => x.type === 'panorama-pyramid' && x.status === 'queued')
    if (!job) { await sleep(POLL_MS); continue }
    await patchPanoramaJob(job.id, { status: 'processing', startedAt: new Date().toISOString(), error: null })
    try {
      const result = await processPanoramaJob(job, (progress) => patchPanoramaJob(job.id, { status: 'processing', progress }))
      await patchPanoramaJob(job.id, { status: 'complete', completedAt: new Date().toISOString(), progress: { stage: 'complete', percent: 1 }, result: { assetId: result.assetId, revision: result.revision, manifestUrl: result.manifestUrl, assetIndexUrl: result.assetIndexUrl } })
      console.log(`[panorama-worker] complete ${job.id}`)
    } catch (error) {
      console.error(`[panorama-worker] failed ${job.id}`, error)
      await patchPanoramaJob(job.id, { status: 'failed', failedAt: new Date().toISOString(), error: error.message || String(error) }).catch(() => {})
    }
  }
}

process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })
main().catch((e) => { console.error(e); process.exitCode = 1 })
