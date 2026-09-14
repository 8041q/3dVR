const DB = '3dvr-offline-library'
const VER = 1
const PROJECTS = 'projects'
const ASSETS = 'assets'
const SHELL = '3dvr-shell-v2'

const requestPromise = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VER)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROJECTS)) {
        db.createObjectStore(PROJECTS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(ASSETS)) {
        const store = db.createObjectStore(ASSETS, { keyPath: 'key' })
        store.createIndex('projectId', 'projectId')
        store.createIndex('url', 'url')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function localAsset(url) {
  const db = await openDatabase()
  try {
    const transaction = db.transaction(ASSETS, 'readonly')
    const candidates = await requestPromise(
      transaction.objectStore(ASSETS).index('url').getAll(url)
    )

    for (const candidate of candidates.sort((a, b) => b.downloadedAt - a.downloadedAt)) {
      const projectTransaction = db.transaction(PROJECTS, 'readonly')
      const project = await requestPromise(
        projectTransaction.objectStore(PROJECTS).get(candidate.projectId)
      )
      if (project?.revision === candidate.revision) return candidate
    }

    return null
  } finally {
    db.close()
  }
}

function parseByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value || '')
  if (!match) return null

  let start
  let end

  if (match[1] === '' && match[2] !== '') {
    const suffixLength = Number(match[2])
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null
    start = Math.max(0, size - suffixLength)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Number(match[2])
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0 || start >= size || end < start) return null

  return {
    start,
    end: Math.min(end, size - 1),
  }
}

function offlineAssetResponse(asset, request) {
  const blob = asset.blob
  const type = asset.type || blob.type || 'application/octet-stream'
  const headers = new Headers({
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'X-3DVR-Offline': '1',
  })

  const rangeHeader = request.headers.get('Range')
  if (!rangeHeader) {
    headers.set('Content-Length', String(blob.size))
    return new Response(blob, { status: 200, headers })
  }

  const range = parseByteRange(rangeHeader, blob.size)
  if (!range) {
    headers.set('Content-Range', `bytes */${blob.size}`)
    return new Response(null, { status: 416, headers })
  }

  const partial = blob.slice(range.start, range.end + 1, type)
  headers.set('Content-Length', String(partial.size))
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${blob.size}`)

  return new Response(partial, { status: 206, headers })
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  const names = await caches.keys()
  await Promise.all(names
    .filter((name) => name.startsWith('3dvr-shell-') && name !== SHELL)
    .map((name) => caches.delete(name)))
  await self.clients.claim()
})()))

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_SHELL') return

  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL)
      for (const url of [...new Set(event.data.urls || [])]) {
        try {
          await cache.add(new Request(url, { cache: 'reload' }))
        } catch {
          // One optional shell asset failing should not invalidate the project copy.
        }
      }
      event.ports?.[0]?.postMessage({ ok: true })
    } catch (error) {
      event.ports?.[0]?.postMessage({ ok: false, error: error.message })
    }
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith((async () => {
    try {
      const asset = await localAsset(event.request.url)
      if (asset?.blob) return offlineAssetResponse(asset, event.request)
    } catch {
      // Network and shell-cache fallback below remains available.
    }

    try {
      const response = await fetch(event.request)
      if (
        response.ok &&
        ['document', 'script', 'style', 'worker', 'font', 'manifest'].includes(event.request.destination)
      ) {
        const cache = await caches.open(SHELL)
        cache.put(event.request, response.clone()).catch(() => {})
      }
      return response
    } catch (error) {
      const cached = await caches.match(event.request)
      if (cached) return cached

      if (event.request.mode === 'navigate') {
        const shell = await caches.match('/index.html') || await caches.match('/')
        if (shell) return shell
      }

      throw error
    }
  })())
})
