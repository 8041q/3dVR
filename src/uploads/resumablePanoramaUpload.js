async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `${options.method || 'GET'} ${url} failed (${response.status})`)
  return body
}

export async function uploadPanoramaFile(file, {
  token,
  signal,
  onProgress = () => {},
} = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const created = await requestJson('/api/panorama-uploads', {
    method: 'POST',
    headers,
    body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size }),
    signal,
  })
  const uploadId = created.uploadId
  const chunkSize = created.chunkSize || 16 * 1024 * 1024
  let offset = created.offset || 0

  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize))
    const response = await fetch(`/api/panorama-uploads/${encodeURIComponent(uploadId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': String(offset),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: chunk,
      signal,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || `Chunk upload failed (${response.status})`)
    }
    offset = Number(response.headers.get('Upload-Offset') || (offset + chunk.size))
    onProgress({ uploadedBytes: offset, totalBytes: file.size, progress: offset / file.size })
  }

  return requestJson(`/api/panorama-uploads/${encodeURIComponent(uploadId)}/complete`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  })
}
