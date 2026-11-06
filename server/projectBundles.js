import { MEDIA_ROOT } from './storagePaths.js'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { createReadStream, createWriteStream, constants } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32 } from 'node:zlib'
import yazl from 'yazl'
import yauzl from 'yauzl'
import { chooseStoredFilename, sanitizeUploadFilename } from './assetStorage.js'
import { readAssetRegistry, registerAsset, removeAssetFromRegistry } from './assetRegistry.js'
import { exportProjectState, importProjectState } from './projectStore.js'
import { INCOMING_ROOT, PANORAMA_ROOT } from './storagePaths.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const JSON_LIMIT = 32 * 1024 * 1024
const MEDIA_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.glb', '.gltf', '.bin', '.mp3', '.wav', '.ogg', '.mp4', '.webm'])
const SOURCE_ORIGIN = 'http://project-bundle.local'
export const bundleError = (message, status = 400) => Object.assign(new Error(message), { status })

function safePath(value) {
  if (typeof value !== 'string' || !value || value.length > 700 || value.startsWith('/') || value.includes('\\')) throw bundleError('Unsafe path in project ZIP.')
  const parts = value.replace(/\/$/, '').split('/')
  if (parts.some((part) => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) throw bundleError('Unsafe path in project ZIP.')
  return parts.join('/')
}
function within(root, relative) {
  const result = path.resolve(root, safePath(relative))
  if (!result.startsWith(`${path.resolve(root)}${path.sep}`)) throw bundleError('Unsafe bundle path.')
  return result
}
function canonicalUrl(value) {
  try { return decodeURIComponent(value.split(/[?#]/)[0]) } catch { throw bundleError('Invalid media URL in project.') }
}
function collectRefs(value, refs, external) {
  if (typeof value === 'string') {
    if (/^\/(uploads|media\/panoramas|demo)\//.test(value)) refs.add(canonicalUrl(value))
    else if (/^https?:\/\//i.test(value)) external.add(value)
  } else if (Array.isArray(value)) value.forEach((item) => collectRefs(item, refs, external))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectRefs(item, refs, external))
}
function rewrite(value, replace) {
  if (typeof value === 'string') return replace(value)
  if (Array.isArray(value)) return value.map((item) => rewrite(item, replace))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item, replace)]))
  return value
}
async function regularFile(file) {
  const stat = await fs.lstat(file).catch(() => { throw bundleError(`A required media file is missing: ${path.basename(file)}`) })
  if (!stat.isFile()) throw bundleError('Project bundles can only include regular media files.')
  return stat
}
async function walk(root, prefix = '') {
  const out = []
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    safePath(relative)
    if (entry.isSymbolicLink()) throw bundleError('Symbolic links cannot be included in a project bundle.')
    if (entry.isDirectory()) out.push(...await walk(path.join(root, entry.name), relative))
    else if (entry.isFile()) out.push(relative)
    else throw bundleError('Unsupported file in project bundle.')
  }
  return out
}
async function jsonFile(file) {
  const stat = await regularFile(file)
  if (stat.size > JSON_LIMIT) throw bundleError('Project JSON is too large.')
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { throw bundleError('The project ZIP contains invalid JSON.') }
}
function validSnapshot(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.scenes) || !Array.isArray(value.guides) || ![1, 2, 3].includes(Number(value.schemaVersion || 3))) throw bundleError('The bundle contains an unsupported project snapshot.')
  return value
}
async function modelJson(file) {
  if (path.extname(file).toLowerCase() === '.gltf') return { json: await jsonFile(file), binary: false }
  if (path.extname(file).toLowerCase() !== '.glb') return null
  const handle = await fs.open(file, 'r')
  try {
    const header = Buffer.alloc(20)
    await handle.read(header, 0, 20, 0)
    const length = header.readUInt32LE(12)
    const stat = await handle.stat()
    if (header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2 || header.readUInt32LE(16) !== 0x4e4f534a || length > JSON_LIMIT || length > stat.size - 20 || header.readUInt32LE(8) !== stat.size) throw bundleError('A referenced GLB model is invalid or unsupported.')
    const bytes = Buffer.alloc(length)
    await handle.read(bytes, 0, length, 20)
    return { json: JSON.parse(bytes.toString('utf8')), binary: true, jsonLength: length, size: stat.size }
  } catch (error) { throw bundleError(error.status ? error.message : 'A referenced GLB model could not be read.') }
  finally { await handle.close() }
}
function modelUri(uri, base) {
  if (typeof uri !== 'string' || uri.startsWith('data:')) return null
  const url = new URL(uri, `${SOURCE_ORIGIN}${base}`)
  return url.origin === SOURCE_ORIGIN ? canonicalUrl(url.pathname) : url.href
}
async function rewriteModel(file, sourceUrl, replace) {
  const model = await modelJson(file)
  if (!model) return
  let changed = false
  for (const item of [...(model.json.buffers || []), ...(model.json.images || [])]) {
    const absolute = modelUri(item.uri, sourceUrl)
    if (!absolute) continue
    const next = replace(absolute)
    if (next !== absolute) { item.uri = next; changed = true }
  }
  if (!changed) return
  if (!model.binary) { await fs.writeFile(file, JSON.stringify(model.json)); return }
  const json = Buffer.from(JSON.stringify(model.json))
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20)
  json.copy(padded)
  const header = Buffer.alloc(20)
  header.write('glTF'); header.writeUInt32LE(2, 4)
  header.writeUInt32LE(model.size - model.jsonLength + padded.length, 8)
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  const temp = `${file}.${crypto.randomUUID()}.part`
  try {
    await fs.writeFile(temp, Buffer.concat([header, padded]), { flag: 'wx' })
    if (20 + model.jsonLength < model.size) await pipeline(createReadStream(file, { start: 20 + model.jsonLength }), createWriteStream(temp, { flags: 'a' }))
    await fs.rename(temp, file)
  } finally { await fs.rm(temp, { force: true }) }
}

export async function extractProjectZip(file, destination, { maxBytes = 20 * 1024 ** 3, maxEntries = 200000 } = {}) {
  let zip
  try {
    zip = await yauzl.openPromise(file, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true })
    if (zip.entryCount > maxEntries) throw bundleError('The project ZIP contains too many files.', 413)
    const seen = new Set()
    const files = []
    let total = 0
    for await (const entry of zip.eachEntry()) {
      const name = safePath(entry.fileName)
      const key = name.normalize('NFC').toLowerCase()
      if (seen.has(key)) throw bundleError('The ZIP contains duplicate file paths.')
      seen.add(key)
      const kind = (entry.externalFileAttributes >>> 16) & 0xf000
      if (kind && kind !== 0x8000 && kind !== 0x4000) throw bundleError('Links and special files are not allowed in project ZIPs.')
      if (entry.generalPurposeBitFlag & 1) throw bundleError('Password-protected ZIP files are not supported.')
      if (entry.fileName.endsWith('/')) continue
      total += entry.uncompressedSize
      if (!Number.isSafeInteger(total) || total > maxBytes) throw bundleError('The extracted project exceeds the server size limit.', 413)
      const target = within(destination, name)
      await fs.mkdir(path.dirname(target), { recursive: true })
      let checksum = 0
      const verify = new Transform({
        transform(chunk, _encoding, callback) { checksum = crc32(chunk, checksum); callback(null, chunk) },
        flush(callback) { callback(checksum === entry.crc32 ? null : bundleError('ZIP checksum verification failed.')) },
      })
      await pipeline(await zip.openReadStreamPromise(entry), verify, createWriteStream(target, { flags: 'wx' }))
      files.push(name)
    }
    const manifests = files.filter((name) => /(^|\/)migration-manifest\.json$/.test(name))
    if (manifests.length !== 1) throw bundleError('Choose a project ZIP containing one migration-manifest.json file.')
    return path.dirname(within(destination, manifests[0]))
  } catch (error) { throw error.status ? error : bundleError(`Could not read the project ZIP: ${error.message}`) }
  finally { zip?.close() }
}

export function createProjectBundleService({ publicRoot = MEDIA_ROOT, panoramaRoot = PANORAMA_ROOT, tempRoot = INCOMING_ROOT,
  snapshotProject = exportProjectState, restoreProject = importProjectState,
  readRegistry = readAssetRegistry, register = registerAsset, unregister = removeAssetFromRegistry } = {}) {
  const uploadsRoot = path.join(publicRoot, 'uploads')
  let importing = Promise.resolve()
  async function prepareExport(projectId, options = {}) {
    const state = await snapshotProject(projectId, options)
    const registry = new Map((await readRegistry()).assets.map((item) => [canonicalUrl(item.url), item]))
    const refs = new Set(), external = new Set(), entries = []
    const projectPath = `server/data/projects/${state.id}`
    for (const item of state.files) {
      const value = item.file ? await jsonFile(item.file) : item.value
      entries.push(item.file ? { name: `${projectPath}/${safePath(item.path)}`, file: item.file }
        : { name: `${projectPath}/${safePath(item.path)}`, data: Buffer.from(JSON.stringify(value, null, 2)) })
      collectRefs(value, refs, external)
    }
    const uploads = [], localAssets = [], panoramas = [], visited = new Set(), panoramaIds = new Set()
    // Model references can themselves introduce more local dependencies.
    for (const url of refs) {
      if (visited.has(url)) continue
      visited.add(url)
      if (url.startsWith('/media/panoramas/')) {
        const id = url.slice('/media/panoramas/'.length).split('/')[0]
        safePath(id)
        const relative = url.slice(`/media/panoramas/${id}/`.length)
        if (!relative.includes('{')) await regularFile(within(panoramaRoot, `${id}/${relative}`))
        if (!panoramaIds.has(id)) {
          panoramaIds.add(id)
          const root = within(panoramaRoot, id)
          if (!(await fs.lstat(root)).isDirectory()) throw bundleError('A panorama directory is missing.')
          const bundlePath = `assets/panoramas/${id}`
          for (const name of await walk(root)) {
            entries.push({ name: `${bundlePath}/${name}`, file: within(root, name) })
            if (name.endsWith('.json')) collectRefs(await jsonFile(within(root, name)), refs, external)
          }
          panoramas.push({ assetId: id, bundlePath })
        }
        continue
      }
      if (!/^\/(uploads|demo)\//.test(url)) throw bundleError(`A model depends on unsupported local media: ${url}`)
      const relative = safePath(url.slice(1))
      if (url.startsWith('/uploads/') && relative.slice(8).includes('/')) throw bundleError('Nested upload paths cannot be exported.')
      if (!MEDIA_EXTENSIONS.has(path.extname(relative).toLowerCase())) throw bundleError(`Unsupported media type: ${url}`)
      const file = within(publicRoot, relative)
      const stat = await regularFile(file)
      const realRoot = await fs.realpath(publicRoot)
      if (!(await fs.realpath(file)).startsWith(`${realRoot}${path.sep}`)) throw bundleError('Media references must stay inside the public media directory.')
      const record = registry.get(url)
      const bundlePath = `assets/${relative}`
      const asset = { url, originalName: record?.originalName || path.basename(file), storedName: path.basename(file), bundlePath, bytes: stat.size, contentType: record?.contentType || 'application/octet-stream' }
      ;(url.startsWith('/uploads/') ? uploads : localAssets).push(asset)
      entries.push({ name: bundlePath, file })
      const model = await modelJson(file)
      if (model) for (const item of [...(model.json.buffers || []), ...(model.json.images || [])]) {
        const dependency = modelUri(item.uri, url)
        if (dependency?.startsWith('/')) refs.add(dependency)
        else if (dependency) external.add(dependency)
      }
    }
    const manifest = { schemaVersion: 1, kind: '3dvr-project-migration-bundle', projectId: state.id, exportedAt: new Date().toISOString(), projectPath, uploads, panoramas, localAssets, externalAssets: [...external] }
    entries.push({ name: 'migration-manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) })
    return { filename: `${sanitizeUploadFilename(state.title || state.id)}.3dvr.zip`, entries, externalAssets: manifest.externalAssets, fileCount: entries.length }
  }
  async function writeExport(plan, output) {
    const zip = new yazl.ZipFile()
    zip.on('error', (error) => zip.outputStream.destroy(error))
    const writing = pipeline(zip.outputStream, output)
    try {
      for (const entry of plan.entries) {
        if (entry.data) zip.addBuffer(entry.data, entry.name)
        else zip.addFile(entry.file, entry.name, { compress: false })
      }
      zip.end()
      await writing
    } catch (error) { zip.outputStream.destroy(error); await writing.catch(() => {}); throw error }
  }
  async function importDirectory(root) {
    const manifest = await jsonFile(within(root, 'migration-manifest.json'))
    if (manifest.kind !== '3dvr-project-migration-bundle' || manifest.schemaVersion !== 1 || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.projectId || '') || manifest.projectPath !== `server/data/projects/${manifest.projectId}`) throw bundleError('Unsupported project bundle.')
    if (![manifest.uploads || [], manifest.panoramas || [], manifest.localAssets || []].every(Array.isArray)) throw bundleError('Invalid project media manifest.')
    const projectRoot = within(root, manifest.projectPath)
    const names = await walk(projectRoot)
    const allowed = names.filter((name) => /^(draft|published|meta)\.json$|^versions\/[a-f0-9]{16}\.json$/i.test(name))
    if (names.length !== allowed.length || !names.includes('draft.json')) throw bundleError('The project data is incomplete or unsupported.')
    const snapshots = new Map()
    let jsonBytes = 0
    for (const name of allowed) {
      jsonBytes += (await regularFile(within(projectRoot, name))).size
      if (jsonBytes > 128 * 1024 * 1024) throw bundleError('Project history is too large.', 413)
      const json = await jsonFile(within(projectRoot, name))
      if (name !== 'meta.json') snapshots.set(name, validSnapshot(json))
    }
    const refs = new Set(), external = new Set(), mappings = new Map(), prefixes = new Map(), sourceUrls = new Set()
    const assets = [...(manifest.uploads || []), ...(manifest.localAssets || [])]
    for (const asset of assets) {
      const url = canonicalUrl(asset.url || '')
      if (!/^\/(uploads|demo)\//.test(url) || sourceUrls.has(url) || typeof asset.bundlePath !== 'string' || !asset.bundlePath.startsWith('assets/') || !MEDIA_EXTENSIONS.has(path.extname(url).toLowerCase())) throw bundleError('Invalid media entry in project bundle.')
      safePath(url.slice(1))
      sourceUrls.add(url)
      const file = within(root, asset.bundlePath)
      const stat = await regularFile(file)
      if (asset.bytes != null && stat.size !== asset.bytes) throw bundleError('A media file does not match its recorded size.')
      const model = await modelJson(file)
      if (model) for (const item of [...(model.json.buffers || []), ...(model.json.images || [])]) {
        const dependency = modelUri(item.uri, url)
        if (dependency?.startsWith('/')) refs.add(dependency)
      }
    }
    for (const panorama of manifest.panoramas || []) {
      if (!/^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,199}$/.test(panorama.assetId || '') || panorama.bundlePath !== `assets/panoramas/${panorama.assetId}`) throw bundleError('Invalid panorama entry.')
      const prefix = `/media/panoramas/${panorama.assetId}/`
      if (prefixes.has(prefix)) throw bundleError('Duplicate panorama in project bundle.')
      prefixes.set(prefix, `/media/panoramas/import-${crypto.randomUUID()}/`)
      const files = await walk(within(root, panorama.bundlePath))
      if (!files.includes('manifest.json') || !files.every((name) => ['.json', '.webp', '.jpg', '.jpeg', '.png'].includes(path.extname(name).toLowerCase()))) throw bundleError('A processed panorama is incomplete or contains unsupported files.')
      for (const name of files.filter((item) => item.endsWith('.json'))) collectRefs(await jsonFile(within(root, `${panorama.bundlePath}/${name}`)), refs, external)
    }
    for (const snapshot of snapshots.values()) collectRefs(snapshot, refs, external)
    for (const url of refs) {
      if (sourceUrls.has(url)) continue
      const prefix = [...prefixes.keys()].find((key) => url.startsWith(key))
      if (prefix) {
        // Templates refer to tile families, while concrete files must exist.
        const relative = url.slice(prefix.length)
        if (!relative.includes('{')) await regularFile(within(root, `assets/panoramas/${prefix.split('/')[3]}/${relative}`))
      } else if (url.startsWith('/demo/')) await regularFile(within(publicRoot, url.slice(1)))
      else throw bundleError(`A required media file is absent from the bundle: ${url}`)
    }
    const createdFiles = [], createdPanoramas = [], registered = []
    function replace(text) {
      if (!/^\/(uploads|media\/panoramas|demo)\//.test(text)) return text
      const url = canonicalUrl(text)
      const suffix = text.slice(text.search(/[?#]/) < 0 ? text.length : text.search(/[?#]/))
      if (mappings.has(url)) return mappings.get(url) + suffix
      for (const [oldPrefix, newPrefix] of prefixes) if (url.startsWith(oldPrefix)) return newPrefix + url.slice(oldPrefix.length) + suffix
      return text
    }
    try {
      await fs.mkdir(uploadsRoot, { recursive: true })
      await fs.mkdir(panoramaRoot, { recursive: true })
      for (const asset of assets) {
        const source = within(root, asset.bundlePath)
        let storedName, destination
        while (true) {
          storedName = await chooseStoredFilename(uploadsRoot, asset.originalName || path.basename(canonicalUrl(asset.url)), path.extname(canonicalUrl(asset.url)).toLowerCase())
          destination = within(uploadsRoot, storedName)
          try { await fs.copyFile(source, destination, constants.COPYFILE_EXCL); break } catch (error) { if (error.code !== 'EEXIST') throw error }
        }
        createdFiles.push(destination)
        mappings.set(canonicalUrl(asset.url), `/uploads/${storedName}`)
      }
      for (const panorama of manifest.panoramas || []) {
        const newPrefix = prefixes.get(`/media/panoramas/${panorama.assetId}/`)
        const newId = newPrefix.split('/')[3]
        const destination = within(panoramaRoot, newId)
        await fs.mkdir(destination)
        createdPanoramas.push(destination)
        for (const entry of await fs.readdir(within(root, panorama.bundlePath))) await fs.cp(within(root, panorama.bundlePath+'/'+entry), within(destination,entry), { recursive:true,errorOnExist:true,force:false })
        for (const name of (await walk(destination)).filter((item) => item.endsWith('.json'))) {
          const original = await jsonFile(within(destination, name))
          const json = rewrite(original, replace)
          if (json.id === panorama.assetId) json.id = newId
          if (json.assetId === panorama.assetId) json.assetId = newId
          await fs.writeFile(within(destination, name), JSON.stringify(json))
        }
      }
      for (let i = 0; i < assets.length; i += 1) {
        const asset = assets[i], file = createdFiles[i], url = mappings.get(canonicalUrl(asset.url))
        await rewriteModel(file, canonicalUrl(asset.url), replace)
        const bytes = (await fs.stat(file)).size
        await register({ url, storedName: path.basename(file), originalName: sanitizeUploadFilename(asset.originalName || asset.storedName), contentType: asset.contentType || 'application/octet-stream', bytes, importedAt: new Date().toISOString() })
        registered.push(url)
      }
      const converted = new Map([...snapshots].map(([name, value]) => [name, rewrite(value, replace)]))
      const project = await restoreProject({ draft: converted.get('draft.json'), published: converted.get('published.json'), versions: [...converted].filter(([name]) => name.startsWith('versions/')).map(([, value]) => value) })
      const mediaResources = []
      for (const file of createdFiles) mediaResources.push({url:'/uploads/'+path.basename(file),bytes:(await fs.stat(file)).size})
      for (const directory of createdPanoramas) {
        let bytes=0
        for(const name of await walk(directory)) bytes+=(await fs.stat(within(directory,name))).size
        mediaResources.push({url:'/media/panoramas/'+path.basename(directory)+'/manifest.json',bytes})
      }
      return { ...project, mediaResources, importedAssets: assets.length, importedPanoramas: (manifest.panoramas || []).length, externalAssets: [...external] }
    } catch (error) {
      for (const url of registered) await unregister(url).catch(() => {})
      for (const file of createdFiles) await fs.rm(file, { force: true }).catch(() => {})
      for (const directory of createdPanoramas) await fs.rm(directory, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }
  async function importZip(file, options) {
    await fs.mkdir(tempRoot, { recursive: true })
    const stage = await fs.mkdtemp(path.join(tempRoot, 'project-extract-'))
    try { return await importDirectory(await extractProjectZip(file, stage, options)) }
    finally { await fs.rm(stage, { recursive: true, force: true }).catch(() => {}) }
  }
  function importArchive(file, options) {
    const operation = importing.then(() => importZip(file, options))
    importing = operation.catch(() => {})
    return operation
  }
  return { prepareExport, writeExport, importArchive }
}
