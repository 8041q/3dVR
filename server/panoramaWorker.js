import 'dotenv/config'
import { listPanoramaJobs, patchPanoramaJob } from './panoramaJobs.js'
import { processPanoramaJob } from './panoramaProcessor.js'

const POLL_MS = Math.max(250, Number(process.env.PANORAMA_WORKER_POLL_MS || 1500))
const HEARTBEAT_MS = 15_000
const STALE_MS = 90_000
let stopping = false
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function needsProcessing(job) {
  if (job.type !== 'panorama-pyramid') return false
  if (job.status === 'queued') return true
  if (job.status !== 'processing') return false
  const lastUpdate = Date.parse(job.updatedAt || job.startedAt || job.createdAt)
  return !Number.isFinite(lastUpdate) || Date.now() - lastUpdate > STALE_MS
}

async function processJob(job) {
  await patchPanoramaJob(job.id, {
    status: 'processing', startedAt: new Date().toISOString(), error: null,
    progress: { stage: 'starting', percent: 0 },
  })

  // The worker processes one job at a time. Heartbeat even while FFmpeg is
  // rendering a long face, so a restarted worker can identify abandoned jobs.
  let updates = Promise.resolve()
  function update(patch) {
    const next = updates.then(() => patchPanoramaJob(job.id, patch))
    updates = next.catch(() => {})
    return next
  }
  const heartbeat = setInterval(() => { void update({}).catch(() => {}) }, HEARTBEAT_MS)
  try {
    const result = await processPanoramaJob(job, (progress) => update({ progress }))
    clearInterval(heartbeat)
    await update({
      status: 'complete', completedAt: new Date().toISOString(),
      progress: { stage: 'complete', percent: 1 },
      result: {
        assetId: result.assetId, revision: result.revision,
        manifestUrl: result.manifestUrl, assetIndexUrl: result.assetIndexUrl,
      },
    })
    console.log(`[panorama-worker] complete ${job.id}`)
  } catch (error) {
    clearInterval(heartbeat)
    console.error(`[panorama-worker] failed ${job.id}`, error)
    await update({ status: 'failed', failedAt: new Date().toISOString(), error: error.message || String(error) }).catch(() => {})
  }
}

async function main() {
  console.log('[panorama-worker] started')
  while (!stopping) {
    const jobs = await listPanoramaJobs()
    const job = jobs.find(needsProcessing)
    if (!job) { await sleep(POLL_MS); continue }
    await processJob(job)
  }
}

process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })
main().catch((e) => { console.error(e); process.exitCode = 1 })
