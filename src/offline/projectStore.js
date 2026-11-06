import { ACTION_TYPES, normalizeHotspotActions } from '../actions/actionTypes.js'

const DB = '3dvr-offline-library'
const VER = 2
const PROJECTS = 'projects'
const ASSETS = 'assets'

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function openDatabase() {
  const request = indexedDB.open(DB, VER)
  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains('identity')) db.createObjectStore('identity',{keyPath:'id'})
    if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' })
    if (!db.objectStoreNames.contains(ASSETS)) {
      const assets = db.createObjectStore(ASSETS, { keyPath: 'key' })
      assets.createIndex('projectId', 'projectId')
      assets.createIndex('url', 'url')
    }
  }
  return requestResult(request)
}

async function putAsset(db, value) {
  const transaction = db.transaction(ASSETS, 'readwrite')
  const done = transactionDone(transaction)
  transaction.objectStore(ASSETS).put(value)
  await done
}

function copyPrefix(id, copyId) {
  return `${id}::${copyId}::`
}

function copyRange(record) {
  const prefix = copyPrefix(record.id, record.copyId || record.revision)
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`)
}

async function deleteCopy(db, record) {
  const transaction = db.transaction(ASSETS, 'readwrite')
  const done = transactionDone(transaction)
  transaction.objectStore(ASSETS).delete(copyRange(record))
  await done
}

// Switch the active copy only after all its files have been downloaded. The
// previous manifest and its blobs are still usable throughout an update.
async function replaceRecord(db, id, record) {
  const transaction = db.transaction(PROJECTS, 'readwrite')
  const done = transactionDone(transaction)
  const projects = transaction.objectStore(PROJECTS)
  const request = projects.get(id)
  request.onsuccess = () => {
    if (record) projects.put(record)
    else projects.delete(id)
  }
  await done
  return request.result
}

function withProjectLock(projectId, operation) {
  if (!navigator.locks?.request) return operation()
  return navigator.locks.request(`3dvr-offline:${projectId}`, operation)
}

async function readAsset(url) {
  const response = await fetch(url, { cache: 'reload' })
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  const blob = await response.blob()
  if (!blob.size || blob.type.startsWith('text/html')) throw new Error(`The downloaded file is not usable: ${url}`)
  return blob
}

function mediaUrl(source, base) {
  const url = new URL(source, base)
  if (url.protocol === 'data:') return null
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Cannot download this asset: ${source}`)
  url.hash = ''
  return url.href
}

export async function modelAssetDependencies(blob, modelUrl) {
  const header = new DataView(await blob.slice(0, 20).arrayBuffer())
  let json
  if (header.byteLength >= 20 && header.getUint32(0, true) === 0x46546c67) {
    const length = header.getUint32(12, true)
    if (header.getUint32(4, true) !== 2 || header.getUint32(16, true) !== 0x4e4f534a || length > blob.size - 20) {
      throw new Error(`Invalid GLB model: ${modelUrl}`)
    }
    json = await blob.slice(20, 20 + length).text()
  } else {
    json = await blob.text()
  }
  let model
  try {
    model = JSON.parse(json)
  } catch {
    throw new Error(`The 3D model couldn’t be read: ${modelUrl}`)
  }
  if (!/^2\./.test(model?.asset?.version)) throw new Error(`Unsupported glTF model: ${modelUrl}`)
  const references = [...(model.buffers || []), ...(model.images || [])]
  return [...new Set(references.filter((item) => item?.uri).map((item) => mediaUrl(item.uri, modelUrl)).filter(Boolean))]
}

async function expandAssets(manifest) {
  const assets = new Map()
  function add(value, base = location.href) {
    const descriptor = typeof value === 'string' ? { url: value } : value
    if (!descriptor?.url) return null
    const url = mediaUrl(descriptor.url, base)
    if (!url) return null
    const asset = { ...assets.get(url), ...descriptor, url }
    assets.set(url, asset)
    return asset
  }

  for (const asset of manifest.assets || []) add(asset)
  const panoramaUrls = new Set()
  for (const scene of manifest.scenes || []) {
    const asset = add(scene.panorama?.manifestUrl)
    if (asset) panoramaUrls.add(asset.url)
  }
  for (const asset of [...assets.values()]) {
    const panorama = panoramaUrls.has(asset.url)
    if (!panorama && !new URL(asset.url).pathname.endsWith('/manifest.json')) continue
    asset.blob = await readAsset(asset.url)
    const definition = JSON.parse(await asset.blob.text())
    if (definition.kind !== 'multires-cubemap' && !panorama) continue
    if (definition.kind !== 'multires-cubemap' || !definition.assetIndexUrl) {
      throw new Error(`The tiled panorama has no offline index: ${asset.url}`)
    }
    const index = add(definition.assetIndexUrl, asset.url)
    if (!index) throw new Error(`The tiled panorama has an invalid offline index: ${asset.url}`)
    index.blob = await readAsset(index.url)
    const indexData = JSON.parse(await index.blob.text())
    if (!Array.isArray(indexData.files) || !indexData.files.length
      || (definition.revision && indexData.revision !== definition.revision)) {
      throw new Error(`The tiled panorama offline index is incomplete: ${asset.url}`)
    }
    for (const tile of indexData.files) add(tile, index.url)
  }
  return [...assets.values()]
}

function projectModelUrls(manifest) {
  const urls = new Set()
  for (const scene of manifest.scenes || []) {
    if (scene.spatial?.roomUrl) urls.add(mediaUrl(scene.spatial.roomUrl, location.href))
    for (const hotspot of scene.hotspots || []) {
      for (const action of normalizeHotspotActions(hotspot)) {
        if (action.type === ACTION_TYPES.INSPECT_MODEL && action.modelUrl) urls.add(mediaUrl(action.modelUrl, location.href))
      }
    }
  }
  return urls
}

async function verifyAsset(asset, blob) {
  if (asset.bytes != null && Number(asset.bytes) !== blob.size) {
    throw new Error(`Size verification failed: ${asset.url}`)
  }
  if (asset.sha256) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
    if (hex !== asset.sha256) throw new Error(`Checksum verification failed: ${asset.url}`)
  }
}

export async function getDownloadedProjectRecord(id) {
  const db = await openDatabase()
  try {
    const projects = db.transaction(PROJECTS, 'readonly').objectStore(PROJECTS)
    const record = await requestResult(projects.get(id))
    if (record?.manifest?.offlineAccount && record.manifest.offlineAccount !== localStorage.getItem('3dvr-offline-account')) return null
    return record
  } finally {
    db.close()
  }
}

export async function getDownloadedProject(id) {
  return (await getDownloadedProjectRecord(id))?.manifest || null
}

export async function verifyDownloadedAssets(record) {
  if (!record?.copyId || !Number.isSafeInteger(record.assetCount)) return false
  const db = await openDatabase()
  try {
    const assets = db.transaction(ASSETS, 'readonly').objectStore(ASSETS)
    return await requestResult(assets.count(copyRange(record))) === record.assetCount
  } finally {
    db.close()
  }
}

export async function getStorageEstimate() {
  try {
    return await navigator.storage?.estimate?.()
  } catch {
    return null
  }
}

export async function downloadProject(manifest, { shell, onProgress = () => {} } = {}) {
  if (!shell?.cacheName) throw new Error('Prepare the offline viewer before downloading the project.')
  try { await navigator.storage?.persist?.() } catch {}
  return withProjectLock(manifest.id, async () => {
    const db = await openDatabase()
    const record = {
      id: manifest.id, revision: manifest.revision, copyId: crypto.randomUUID(), manifest, shell,
      assetCount: 0, bytes: 0, downloadedAt: Date.now(),
    }
    try {
      const assets = await expandAssets(manifest)
      const models = projectModelUrls(manifest)
      const knownUrls = new Set(assets.map((asset) => asset.url))
      for (const asset of assets) {
        const blob = asset.blob || await readAsset(asset.url)
        await verifyAsset(asset, blob)
        if (models.has(asset.url)) {
          for (const url of await modelAssetDependencies(blob, asset.url)) {
            if (knownUrls.has(url)) continue
            knownUrls.add(url)
            assets.push({ url })
          }
        }
        await putAsset(db, {
          key: copyPrefix(record.id, record.copyId) + asset.url,
          projectId: record.id, revision: record.revision, copyId: record.copyId,
          url: asset.url, blob, size: blob.size, type: blob.type, downloadedAt: record.downloadedAt,
        })
        record.assetCount += 1
        record.bytes += blob.size
        onProgress({ completed: record.assetCount, total: assets.length, bytes: record.bytes })
      }
      const previous = await replaceRecord(db, record.id, record)
      if (previous) await deleteCopy(db, previous).catch(() => {})
      return record
    } catch (error) {
      await deleteCopy(db, record).catch(() => {})
      throw error
    } finally {
      db.close()
    }
  })
}

export function removeDownloadedProject(id) {
  return withProjectLock(id, async () => {
    const db = await openDatabase()
    try {
      const previous = await replaceRecord(db, id, null)
      if (previous) await deleteCopy(db, previous)
    } finally {
      db.close()
    }
  })
}

export async function clearPrivateDownloads() {
  const db = await openDatabase()
  let records
  try { records = await requestResult(db.transaction(PROJECTS,'readonly').objectStore(PROJECTS).getAll()) } finally { db.close() }
  for (const record of records) if (record.manifest?.offlineAccount) await removeDownloadedProject(record.id)
}

export async function setOfflineAccount(user) {
  const db = await openDatabase()
  try { const tx=db.transaction('identity','readwrite'); tx.objectStore('identity').put({id:'active',user}); await transactionDone(tx) } finally {db.close()}
}
