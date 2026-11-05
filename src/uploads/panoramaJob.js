async function requestJob(jobId, { token, signal, retry = false } = {}) {
  const response = await fetch(`/api/panorama-jobs/${encodeURIComponent(jobId)}${retry ? '/retry' : ''}`, {
    method: retry ? 'POST' : 'GET',
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Could not read panorama job (${response.status})`)
  return body
}

export function retryPanoramaJob(jobId, options) {
  return requestJob(jobId, { ...options, retry: true })
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)
    function abort() {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export async function waitForPanoramaJob(jobId, { token, signal, intervalMs = 1250, onUpdate = () => {} } = {}) {
  while (true) {
    signal?.throwIfAborted()
    const job = await requestJob(jobId, { token, signal })
    signal?.throwIfAborted()
    onUpdate(job)
    if (job.status === 'complete' || job.status === 'failed') return job
    await delay(intervalMs, signal)
  }
}
