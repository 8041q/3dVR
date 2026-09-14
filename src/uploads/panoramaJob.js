export async function getPanoramaJob(jobId, { signal } = {}) {
  const response = await fetch(`/api/panorama-jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store', signal })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Could not read panorama job (${response.status})`)
  return body
}
export async function waitForPanoramaJob(jobId, { signal, intervalMs = 1250, onUpdate = () => {} } = {}) {
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const job = await getPanoramaJob(jobId, { signal })
    onUpdate(job)
    if (job.status === 'complete') return job
    if (job.status === 'failed') throw new Error(job.error || 'Panorama processing failed')
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs)
      const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
      signal?.addEventListener('abort', abort, { once: true })
    })
  }
}
