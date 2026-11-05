import { ACTION_TYPES, normalizeHotspotActions } from '../actions/actionTypes.js'
import { basePanoramaTiles, panoramaTileUrl, readPanoramaManifest } from '../panorama/panoramaSource.js'

function resolveUrl(value, base = location.href) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing media URL.')
  const url = new URL(value, base)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS media URL.')
  return url
}

export function checkImage(source, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    function finish(error) {
      image.onload = null
      image.onerror = null
      signal.removeEventListener('abort', stop)
      if (error) reject(error)
      else resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    function stop() {
      finish(signal.reason)
      image.removeAttribute('src')
    }
    if (signal.aborted) return stop()
    image.crossOrigin = 'anonymous'
    image.onload = () => finish()
    image.onerror = () => finish(new Error('The image couldn’t load.'))
    signal.addEventListener('abort', stop, { once: true })
    image.src = source
  })
}

async function checkPanoramaSource(url, tiled, signal) {
  if (!tiled) {
    await checkImage(url.href, signal)
    return true
  }
  const response = await fetch(url, { signal, cache: 'no-cache' })
  if (!response.ok) throw new Error('The tile manifest couldn’t load.')
  const manifest = readPanoramaManifest(await response.json(), response.url || url.href)
  const tiles = basePanoramaTiles(manifest).map((tile) => resolveUrl(panoramaTileUrl(tile)))
  const local = tiles.filter((tile) => tile.origin === location.origin)
  for (let index = 0; index < local.length; index += 6) {
    await Promise.all(local.slice(index, index + 6).map((tile) => checkImage(tile.href, signal)))
  }
  return local.length === tiles.length
}

async function checkGlb(url, signal) {
  const response = await fetch(url, { signal, cache: 'no-cache', headers: { Range: 'bytes=0-11' } })
  if (!response.ok || !response.body) throw new Error('The GLB couldn’t load.')
  const reader = response.body.getReader()
  const header = new Uint8Array(12)
  let offset = 0
  try {
    while (offset < header.length) {
      const { value, done } = await reader.read()
      if (done) break
      const part = value.subarray(0, header.length - offset)
      header.set(part, offset)
      offset += part.length
    }
  } finally {
    // Some hosts send the full model even for a range request.
    void reader.cancel().catch(() => {})
  }
  const view = new DataView(header.buffer)
  if (offset < header.length || view.getUint32(0, true) !== 0x46546c67
    || view.getUint32(4, true) !== 2 || view.getUint32(8, true) < 20) {
    throw new Error('The file isn’t a valid GLB 2.0 model.')
  }
}

async function checkGltf(url, signal) {
  const response = await fetch(url, { signal, cache: 'no-cache' })
  if (!response.ok) throw new Error('The glTF couldn’t load.')
  const model = await response.json()
  if (!/^2\./.test(model?.asset?.version)) throw new Error('The file isn’t a valid glTF 2.0 model.')
}

export async function checkProjectMedia(project, signal, modelStatus = {}) {
  const tasks = []
  const publicUrl = new URL(`/v/${encodeURIComponent(project.id || 'default')}`, location.origin)
  for (const scene of project.scenes || []) {
    const name = scene.title || 'Untitled scene'
    const target = { tool: 'scene', sceneId: scene.id }
    const { image, panorama } = scene
    const manifest = panorama?.manifestUrl
    if (manifest || image) tasks.push(async () => {
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(15000)])
      let result
      for (const [source, tiled] of [[manifest, true], [image, false]]) {
        if (!source) continue
        let next
        try {
          const url = resolveUrl(source, publicUrl)
          if (url.origin !== location.origin) next = 'external'
          else next = await checkPanoramaSource(url, tiled, timeout) ? 'ready' : 'external'
        } catch {
          next = 'failed'
        }
        if (!result) result = next
        else if (next === 'ready') return { ...target, severity: 'warning', message: `${name}: the backup image loads. Check the configured panorama tiles.` }
        else if (result === 'failed') result = next
        if (result === 'ready') return null
      }
      if (result === 'external') return { ...target, severity: 'warning', message: `${name}: preview the externally hosted panorama before publishing.` }
      return { ...target, message: `${name}: the panorama couldn’t load. Retry or choose a working source.` }
    })
    for (const hotspot of scene.hotspots || []) {
      for (const action of normalizeHotspotActions(hotspot)) {
        if (action.type !== ACTION_TYPES.INSPECT_MODEL || typeof action.modelUrl !== 'string' || !action.modelUrl.trim()) continue
        tasks.push(async () => {
          const item = { tool: 'hotspots', sceneId: scene.id, hotspotId: hotspot.id, actionId: action.id }
          const label = `${name} / ${hotspot.label || 'Untitled hotspot'}`
          try {
            const url = resolveUrl(action.modelUrl, publicUrl)
            if (url.origin !== location.origin) {
              return { ...item, severity: 'warning', message: `${label}: preview the externally hosted model before publishing.` }
            }
            const timeout = AbortSignal.any([signal, AbortSignal.timeout(15000)])
            if (/\.gltf$/i.test(url.pathname)) {
              await checkGltf(url, timeout)
              return { ...item, severity: 'warning', message: `${label}: preview this glTF to verify its linked files.` }
            }
            await checkGlb(url, timeout)
            if (modelStatus[action.modelUrl]?.state === 'error') {
              return { ...item, severity: 'warning', message: `${label}: the product preview couldn’t open this model. Retry the preview before sharing.` }
            }
            return null
          } catch (error) {
            return { ...item, message: `${label}: ${error.message || 'The model couldn’t load.'}` }
          }
        })
      }
    }
  }

  const results = []
  let next = 0
  async function worker() {
    while (!signal.aborted && next < tasks.length) {
      const index = next++
      results[index] = await tasks[index]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, worker))
  return results.filter(Boolean)
}
