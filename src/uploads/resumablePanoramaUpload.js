const DEFAULT_CHUNK_SIZE = 16 * 1024 * 1024

async function responseError(response, fallback) {
  const body = await response.json().catch(() => ({}))
  return new Error(body.error || `${fallback} (${response.status})`)
}

async function requestJson(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) throw await responseError(response, 'Panorama upload failed')
  return response.json()
}

// Compare bytes as well as the file name and size when the author reselects a
// master. Reading small samples keeps this cheap for multi-gigabyte files.
export async function panoramaFileIdentity(file) {
  const windowSize = 64 * 1024
  const end = Math.max(0, file.size - windowSize)
  const positions = [...new Set([0, Math.floor(end / 2), end])]
  const samples = await Promise.all(positions.map((offset) => file.slice(offset, offset + windowSize).arrayBuffer()))
  const bytes = new Uint8Array(await new Blob(samples).arrayBuffer())
  let hash
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
  } else {
    let checksum = 2166136261
    for (const value of bytes) checksum = Math.imul(checksum ^ value, 16777619)
    hash = (checksum >>> 0).toString(16)
  }
  return { name: file.name, size: file.size, lastModified: file.lastModified, hash }
}

export function samePanoramaFile(left, right) {
  return Boolean(left && right && left.name === right.name && left.size === right.size
    && left.lastModified === right.lastModified && left.hash === right.hash)
}

function uploadUrl(id) {
  return `/api/panorama-uploads/${encodeURIComponent(id)}`
}

function readOffset(value, fileSize) {
  const offset = Number(value)
  if (value == null || !Number.isSafeInteger(offset) || offset < 0 || offset > fileSize) {
    throw new Error('The server returned an invalid upload offset.')
  }
  return offset
}

async function getUpload(uploadId, fileSize, headers, signal) {
  const response = await fetch(uploadUrl(uploadId), { method: 'HEAD', cache: 'no-store', headers, signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Could not resume panorama upload (${response.status}).`)
  if (Number(response.headers.get('Upload-Length')) !== fileSize) {
    throw new Error('This upload belongs to a file of a different size.')
  }
  return {
    uploadId,
    offset: readOffset(response.headers.get('Upload-Offset'), fileSize),
    chunkSize: Number(response.headers.get('Upload-Chunk-Size')) || DEFAULT_CHUNK_SIZE,
  }
}

export async function recoverCompletedUpload(uploadId, fileSize, { token, signal } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const session = await getUpload(uploadId, fileSize, headers, signal)
  if (session?.offset !== fileSize) return null
  return requestJson(`${uploadUrl(uploadId)}/complete`, { method: 'POST', headers, signal })
}

export async function uploadPanoramaFile(file, {
  token,
  signal,
  uploadId: existingId,
  onSession = () => {},
  onProgress = () => {},
} = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  let session = existingId ? await getUpload(existingId, file.size, headers, signal) : null
  if (!session) {
    session = await requestJson('/api/panorama-uploads', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size }),
      signal,
    })
  }
  const { uploadId, chunkSize = DEFAULT_CHUNK_SIZE } = session
  let offset = readOffset(session.offset, file.size)
  onSession(uploadId)
  const report = () => onProgress({ uploadedBytes: offset, totalBytes: file.size, progress: offset / file.size })
  report()

  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize))
    const response = await fetch(uploadUrl(uploadId), {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': String(offset),
      },
      body: chunk,
      signal,
    })
    if (response.status === 409 && response.headers.has('Upload-Offset')) {
      // A previous request may have written these bytes even if its response
      // never made it back to the browser.
      const serverOffset = readOffset(response.headers.get('Upload-Offset'), file.size)
      if (serverOffset <= offset) throw await responseError(response, 'Upload offset did not advance')
      offset = serverOffset
    } else {
      if (!response.ok) throw await responseError(response, 'Chunk upload failed')
      const nextOffset = readOffset(response.headers.get('Upload-Offset'), file.size)
      if (nextOffset !== offset + chunk.size) throw new Error('The server did not confirm the full upload chunk.')
      offset = nextOffset
    }
    report()
  }

  return requestJson(`${uploadUrl(uploadId)}/complete`, { method: 'POST', headers, signal })
}
