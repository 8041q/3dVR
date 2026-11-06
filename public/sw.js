const DB = '3dvr-offline-library'
const VER = 2
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
      if (!db.objectStoreNames.contains('identity')) db.createObjectStore('identity',{keyPath:'id'})
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

async function downloadedCopy(projectId, url) {
  if (!projectId) return {}
  const db = await openDatabase()
  try {
    const transaction = db.transaction([PROJECTS, ASSETS, 'identity'], 'readonly')
    const request = transaction.objectStore(PROJECTS).get(projectId)
    return await new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const project = request.result
        // Private copies require the account marker written after an online login.
        if (project?.manifest?.offlineAccount) {
          const marker = transaction.objectStore('identity').get('active')
          marker.onsuccess = () => {
            if (marker.result?.user !== project.manifest.offlineAccount) return resolve({})
            if (!url) return resolve({project})
            const key = `${project.id}::${project.copyId || project.revision}::${url}`
            requestPromise(transaction.objectStore(ASSETS).get(key)).then(asset => resolve({project,asset}),reject)
          }
          marker.onerror = () => resolve({})
          return
        }
        if (!project || !url) {
          resolve({ project })
          return
        }
        const key = `${project.id}::${project.copyId || project.revision}::${url}`
        requestPromise(transaction.objectStore(ASSETS).get(key)).then((asset) => resolve({ project, asset }), reject)
      }
    })
  } finally {
    db.close()
  }
}

function viewerProjectId(url) {
  if (!url) return null
  const parsed = new URL(url)
  if (parsed.origin !== self.location.origin) return null
  const path = parsed.pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return 'default'
  const match = path.match(/^\/v\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

async function copyForRequest(event) {
  if (event.request.mode === 'navigate') return downloadedCopy(viewerProjectId(event.request.url))
  const client = event.clientId ? await self.clients.get(event.clientId) : null
  return downloadedCopy(viewerProjectId(client?.url) || viewerProjectId(event.request.referrer), event.request.url)
}

async function offlineShellFile(project, request) {
  const shell = project?.shell
  if (!shell?.cacheName || !await caches.has(shell.cacheName)) return null
  const cache = await caches.open(shell.cacheName)
  return cache.match(request.mode === 'navigate' ? shell.indexUrl : request)
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
  if (event.data?.type === 'OFFLINE_PROTOCOL') event.ports?.[0]?.postMessage({ version: 1 })
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request)
      if (
        response.ok &&
        new URL(event.request.url).origin === self.location.origin &&
        ['document', 'script', 'style', 'worker', 'font', 'manifest'].includes(event.request.destination)
      ) {
        const cache = await caches.open(SHELL)
        cache.put(event.request, response.clone()).catch(() => {})
      }
      return response
    } catch (error) {
      // Explicit download fetches require fresh bytes. A browser page reload
      // also marks scripts/styles as reload; those still need the saved shell.
      if (event.request.cache === 'reload' && !event.request.destination && event.request.mode !== 'navigate') throw error
      try {
        const { project, asset } = await copyForRequest(event)
        if (asset?.blob) return offlineAssetResponse(asset, event.request)
        const shell = await offlineShellFile(project, event.request)
        if (shell) return shell
      } catch {
        // The generic app cache can still open previously visited routes.
      }
      const runtime = await caches.open(SHELL)
      const cached = await runtime.match(event.request)
      if (cached) return cached

      if (event.request.mode === 'navigate') {
        const shell = await runtime.match('/index.html') || await runtime.match('/')
        if (shell) return shell
      }

      throw error
    }
  })())
})
