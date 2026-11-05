const OFFLINE_CACHE_PREFIX = '3dvr-verified-shell-v1-'
export const OFFLINE_UNAVAILABLE_MESSAGE = 'Open the published tour’s secure link (https://) to save it for offline use.'
const OFFLINE_PROTOCOL = 1
const VIEWER_FILES = [
  '/manifest.webmanifest',
  '/brand/3dvr-portal-v2.svg',
  '/icons/3dvr-portal-v2.svg',
  '/icons/3dvr-portal-v2.ico',
  '/icons/3dvr-portal-v2-180.png',
  '/icons/3dvr-portal-v2-192.png',
  '/icons/3dvr-portal-v2-512.png',
  '/icons/3dvr-portal-v2-maskable-192.png',
  '/icons/3dvr-portal-v2-maskable-512.png',
  '/vendor/draco/draco_decoder.js',
  '/vendor/draco/draco_wasm_wrapper.js',
  '/vendor/draco/draco_decoder.wasm',
  '/vendor/basis/basis_transcoder.js',
  '/vendor/basis/basis_transcoder.wasm',
]

export function supportsOfflineViewer() {
  return Boolean(import.meta.env.PROD && 'serviceWorker' in navigator && 'caches' in globalThis)
}

export async function registerOfflineServiceWorker() {
  if (!supportsOfflineViewer()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (error) {
    console.warn('[offline]', error)
    return null
  }
}

function waitForController() {
  const serviceWorker = navigator.serviceWorker
  if (serviceWorker.controller) return Promise.resolve(serviceWorker.controller)

  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(null), 5000)
    function finish(worker) {
      clearTimeout(timer)
      serviceWorker.removeEventListener('controllerchange', check)
      resolve(worker)
    }
    function check() {
      if (serviceWorker.controller) finish(serviceWorker.controller)
    }
    serviceWorker.addEventListener('controllerchange', check)
    check()
  })
}

function workerSupportsOfflineCopies(worker) {
  if (!worker) return Promise.resolve(false)
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel()
    const timer = setTimeout(() => finish(false), 2000)
    function finish(supported) {
      clearTimeout(timer)
      port1.close()
      resolve(supported)
    }
    port1.onmessage = (event) => finish(event.data?.version === OFFLINE_PROTOCOL)
    try {
      worker.postMessage({ type: 'OFFLINE_PROTOCOL' }, [port2])
    } catch {
      finish(false)
    }
  })
}

export async function cacheCurrentAppShell() {
  if (!supportsOfflineViewer()) {
    throw new Error(OFFLINE_UNAVAILABLE_MESSAGE)
  }
  if (!await workerSupportsOfflineCopies(await waitForController())) {
    throw new Error('The offline viewer is still starting. Reload the page and try again.')
  }

  const indexUrl = new URL('/index.html', location.origin)
  const response = await fetch(indexUrl, { cache: 'reload' })
  if (!response.ok) throw new Error('Could not download the offline viewer.')
  const html = await response.clone().text()
  const index = new DOMParser().parseFromString(html, 'text/html')
  const entries = [...index.querySelectorAll('script[type="module"][src]')]
  if (!entries.length) throw new Error('The downloaded viewer did not include an app entry point.')
  const references = [
    ...entries.map((entry) => entry.getAttribute('src')),
    ...[...index.querySelectorAll('link[rel="stylesheet"][href],link[rel="modulepreload"][href]')]
      .map((entry) => entry.getAttribute('href')),
    ...VIEWER_FILES,
  ]
  const urls = [...new Set(references.map((path) => new URL(path, indexUrl).href))]
  if (urls.some((url) => new URL(url).origin !== indexUrl.origin)) {
    throw new Error('The viewer uses an external app file that cannot be prepared for offline use.')
  }

  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html))
  const version = Array.from(new Uint8Array(hash), (part) => part.toString(16).padStart(2, '0')).join('')
  const cacheName = `${OFFLINE_CACHE_PREFIX}${version}`
  const cache = await caches.open(cacheName)
  for (const url of urls) {
    if (!await cache.match(url)) {
      const asset = await fetch(url, { cache: 'reload' })
      if (!asset.ok) throw new Error(`Could not cache viewer file ${new URL(url).pathname} (${asset.status}).`)
      await cache.put(url, asset)
    }
  }
  await cache.put(indexUrl, response)
  return { cacheName, indexUrl: indexUrl.href, urls }
}

export async function verifyCachedAppShell(shell) {
  if (!supportsOfflineViewer() || !shell?.cacheName?.startsWith(OFFLINE_CACHE_PREFIX)
    || !shell.indexUrl || !Array.isArray(shell.urls)) return false
  if (!await workerSupportsOfflineCopies(navigator.serviceWorker.controller)) return false
  if (!await caches.has(shell.cacheName)) return false
  const cache = await caches.open(shell.cacheName)
  const files = await Promise.all([shell.indexUrl, ...shell.urls].map((url) => cache.match(url)))
  return files.every((response) => response?.ok)
}
