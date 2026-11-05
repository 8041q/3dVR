export async function prepareProjectExport({ projectId, token, draft, expectedDraftRevision }) {
  const response = await fetch(`/api/project-transfers/export/${encodeURIComponent(projectId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
    body: JSON.stringify(draft ? { draft, expectedDraftRevision } : {}),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Could not prepare the project export.')
  if (!/^\/api\/project-transfers\/download\/[a-f0-9]{64}$/.test(body.downloadUrl || '')) throw new Error('The server returned an invalid download link.')
  return body
}

export function uploadProjectArchive(file, { token, onProgress = () => {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const abort = () => request.abort()
    const finish = (error, value) => {
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(value)
    }
    if (signal?.aborted) { reject(new DOMException('Import canceled.', 'AbortError')); return }
    request.open('POST', '/api/project-transfers/import')
    request.setRequestHeader('Authorization', `Bearer ${token || ''}`)
    request.setRequestHeader('Content-Type', 'application/zip')
    request.upload.onprogress = (event) => onProgress({ uploaded: event.loaded, total: event.lengthComputable ? event.total : file.size, processing: false })
    request.upload.onload = () => onProgress({ uploaded: file.size, total: file.size, processing: true })
    request.onload = () => {
      let body
      try { body = JSON.parse(request.responseText) } catch { body = {} }
      if (request.status < 200 || request.status >= 300) finish(new Error(body.error || 'Could not import the project ZIP.'))
      else if (!body.id || !body.meta) finish(new Error('The server returned an incomplete import result.'))
      else finish(null, body)
    }
    request.onerror = () => finish(new Error('The project upload was interrupted. Choose the ZIP and try again.'))
    request.onabort = () => finish(new DOMException('Import canceled.', 'AbortError'))
    signal?.addEventListener('abort', abort, { once: true })
    request.send(file)
  })
}
