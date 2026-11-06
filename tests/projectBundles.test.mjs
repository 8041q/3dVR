import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pipeline } from 'node:stream/promises'
import yazl from 'yazl'
import express from 'express'
import { createProjectBundleService, extractProjectZip } from '../server/projectBundles.js'
import { createProjectTransfersRouter } from '../server/projectTransfers.js'
import { securityDb } from '../server/identity.js'

function glb(json) {
  const data = Buffer.from(JSON.stringify(json))
  const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4, 0x20)
  data.copy(padded)
  const header = Buffer.alloc(20)
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length, 8)
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  return Buffer.concat([header, padded])
}
async function fixture(t) {
  const root = await fs.mkdtemp(fileURLToPath(new URL('./.bundle-test-', import.meta.url)))
  assert.ok(root.startsWith(fileURLToPath(new URL('./', import.meta.url))))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const serverRoot = path.join(root, 'server'), publicRoot = path.join(root, 'public'), panoramaRoot = path.join(root, 'panoramas'), tempRoot = path.join(root, 'incoming')
  for (const dir of [serverRoot, path.join(root, 'src'), path.join(publicRoot, 'uploads'), path.join(publicRoot, 'demo'), panoramaRoot]) await fs.mkdir(dir, { recursive: true })
  await fs.copyFile(new URL('../server/projectStore.js', import.meta.url), path.join(serverRoot, 'projectStore.mjs'))
  await fs.copyFile(new URL('../server/accountFiles.js', import.meta.url), path.join(serverRoot,'accountFiles.js'))
  for (const name of ['projectMetadata.js', 'projectSettings.js']) await fs.copyFile(new URL(`../src/${name}`, import.meta.url), path.join(root, 'src', name))
  const store = await import(pathToFileURL(path.join(serverRoot, 'projectStore.mjs')))
  const records = new Map()
  const dependencies = { publicRoot, panoramaRoot, tempRoot, snapshotProject: store.exportProjectState, restoreProject: store.importProjectState,
    readRegistry: async () => ({ assets: [...records.values()] }), register: async (record) => records.set(record.url, record), unregister: async (url) => records.delete(url) }
  const service = createProjectBundleService(dependencies)
  const write = async (relative, data) => { const file = path.join(publicRoot, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, data) }
  await write('uploads/history.jpg', 'old panorama')
  await write('uploads/current.jpg', 'current panorama')
  await write('uploads/voice.mp3', 'narration bytes')
  await write('uploads/payload.bin', 'external model buffer')
  await write('uploads/texture.png', 'external texture')
  await write('uploads/model.glb', glb({ asset: { version: '2.0' }, buffers: [{ uri: 'payload.bin', byteLength: 21 }], images: [{ uri: 'texture.png' }] }))
  await write('demo/demo.gltf', JSON.stringify({ asset: { version: '2.0' }, images: [{ uri: 'images/demo.png' }] }))
  await write('demo/images/demo.png', 'demo texture')
  const pano = path.join(panoramaRoot, 'pano-one')
  await fs.mkdir(path.join(pano, 'levels'), { recursive: true })
  await fs.writeFile(path.join(pano, 'manifest.json'), JSON.stringify({ id: 'pano-one', kind: 'multires-cubemap', revision: 'one', assetIndexUrl: '/media/panoramas/pano-one/asset-index.json', levels: [{ tileUrlTemplate: '/media/panoramas/pano-one/levels/{face}.webp' }] }))
  await fs.writeFile(path.join(pano, 'asset-index.json'), JSON.stringify({ assetId: 'pano-one', revision: 'one', files: [{ url: '/media/panoramas/pano-one/levels/front.webp', bytes: 10 }] }))
  await fs.writeFile(path.join(pano, 'levels', 'front.webp'), 'tile bytes')
  let project = await store.createProject({ title: 'Portable tour', metadata: { author: 'Archive test', description: 'Saved description' } })
  project = await store.saveProjectDraft(project.id, { ...project, scenes: [{ ...project.scenes[0], image: '/uploads/history.jpg' }] })
  await store.publishProject(project.id)
  project = await store.saveProjectDraft(project.id, { ...project, settings: { showGuideMenu: false, allowOffline: false }, scenes: [{ ...project.scenes[0], image: '/uploads/current.jpg', panorama: { manifestUrl: '/media/panoramas/pano-one/manifest.json' }, spatial: { roomUrl: '/uploads/model.glb' }, hotspots: [{ id: 'demo', modelUrl: '/demo/demo.gltf', audioUrl: '/uploads/voice.mp3#cue', videoUrl: 'https://example.test/video.mp4' }] }] })
  await store.publishProject(project.id)
  project = await store.getProjectDraft(project.id)
  async function archive(options = {}) {
    const plan = await service.prepareExport(project.id, options)
    const file = path.join(root, `archive-${crypto.randomUUID()}.zip`)
    await service.writeExport(plan, createWriteStream(file))
    return { file, plan }
  }
  return { root, serverRoot, publicRoot, panoramaRoot, tempRoot, store, service, records, dependencies, project, archive }
}

test('whole-project ZIP round trip includes unsaved metadata, history, panorama tiles, demo assets and linked model files', async (t) => {
  const f = await fixture(t)
  const before = await f.store.getProjectDraft(f.project.id)
  const edited = { ...before, metadata: { ...before.metadata, description: 'Unsaved description' } }
  const { file, plan } = await f.archive({ draft: edited, expectedDraftRevision: before.meta.draftRevision })
  assert.ok(plan.entries.some((item) => item.name.endsWith('history.jpg')))
  assert.ok(plan.entries.some((item) => item.name.endsWith('payload.bin')))
  assert.ok(plan.entries.some((item) => item.name.endsWith('demo/images/demo.png')))
  assert.deepEqual(await f.store.getProjectDraft(before.id), before)
  const imported = await f.service.importArchive(file)
  assert.notEqual(imported.id, before.id)
  assert.equal(imported.metadata.description, 'Unsaved description')
  assert.deepEqual(imported.settings, before.settings)
  assert.equal(imported.meta.isPublished, false)
  await assert.rejects(f.store.getPublishedManifest(imported.id), { status: 404 })
  assert.equal(await fs.readFile(path.join(f.publicRoot, imported.scenes[0].image), 'utf8'), 'current panorama')
  assert.equal(await fs.readFile(path.join(f.publicRoot, 'uploads/current.jpg'), 'utf8'), 'current panorama')
  assert.notEqual(imported.scenes[0].image, before.scenes[0].image)
  assert.ok(imported.scenes[0].hotspots[0].audioUrl.endsWith('#cue'))
  const model = await fs.readFile(path.join(f.publicRoot, imported.scenes[0].spatial.roomUrl))
  const json = JSON.parse(model.subarray(20, 20 + model.readUInt32LE(12)).toString())
  assert.match(json.buffers[0].uri, /^\/uploads\/payload-2\.bin$/)
  assert.match(json.images[0].uri, /^\/uploads\/texture-2\.png$/)
  assert.equal(model.readUInt32LE(8), model.length)
  const demo = JSON.parse(await fs.readFile(path.join(f.publicRoot, imported.scenes[0].hotspots[0].modelUrl), 'utf8'))
  assert.match(demo.images[0].uri, /^\/uploads\/demo\.png$/)
  const panoId = imported.scenes[0].panorama.manifestUrl.split('/')[3]
  assert.notEqual(panoId, 'pano-one')
  const manifest = JSON.parse(await fs.readFile(path.join(f.panoramaRoot, panoId, 'manifest.json'), 'utf8'))
  assert.equal(manifest.id, panoId)
  assert.match(manifest.assetIndexUrl, new RegExp(panoId))
  assert.equal(await fs.readFile(path.join(f.panoramaRoot, panoId, 'levels/front.webp'), 'utf8'), 'tile bytes')
  const versions = await fs.readdir(path.join(f.root, 'storage/data/projects', imported.id, 'versions'))
  assert.equal(versions.length, 2)
  for (const version of versions) assert.equal((await f.store.getProjectVersion(imported.id, version.slice(0, -5))).id, imported.id)
  const secondPlan = await f.service.prepareExport(imported.id)
  const secondFile = path.join(f.root, 'second.zip')
  await f.service.writeExport(secondPlan, createWriteStream(secondFile))
  assert.notEqual((await f.service.importArchive(secondFile)).id, imported.id)
  assert.deepEqual(await fs.readdir(f.tempRoot), [])
})

test('stale exports, missing media and truncated ZIPs fail without altering projects', async (t) => {
  const f = await fixture(t)
  await assert.rejects(f.archive({ draft: f.project, expectedDraftRevision: 'stale' }), { status: 409 })
  const missing = await f.service.prepareExport(f.project.id)
  missing.entries = missing.entries.filter((entry) => !entry.name.endsWith('/voice.mp3'))
  const file = path.join(f.root, 'missing.zip')
  await f.service.writeExport(missing, createWriteStream(file))
  await assert.rejects(f.service.importArchive(file), /missing|absent/)
  await fs.writeFile(path.join(f.root, 'invalid.zip'), 'not a zip')
  await assert.rejects(f.service.importArchive(path.join(f.root, 'invalid.zip')), { status: 400 })
  assert.equal((await f.store.listProjects()).length, 2)
  assert.equal(f.records.size, 0)
})

test('failed project commit rolls back only newly imported files and registry records', async (t) => {
  const f = await fixture(t)
  const { file } = await f.archive()
  const uploads = await fs.readdir(path.join(f.publicRoot, 'uploads'))
  const panoramas = await fs.readdir(f.panoramaRoot)
  const service = createProjectBundleService({ ...f.dependencies, restoreProject: async () => { throw new Error('Simulated disk failure') } })
  await assert.rejects(service.importArchive(file), /Simulated disk failure/)
  assert.deepEqual(await fs.readdir(path.join(f.publicRoot, 'uploads')), uploads)
  assert.deepEqual(await fs.readdir(f.panoramaRoot), panoramas)
  assert.equal(f.records.size, 0)
})

async function smallZip(file, entries) {
  const zip = new yazl.ZipFile()
  const output = pipeline(zip.outputStream, createWriteStream(file))
  for (const [name, data, options] of entries) zip.addBuffer(Buffer.from(data), name, { compress: false, ...options })
  zip.end(); await output
}

test('ZIP validation rejects traversal, links, case collisions, corrupt data and size limits', async (t) => {
  const f = await fixture(t)
  const file = path.join(f.root, 'unsafe.zip')
  async function rejects(entries, match, limits) {
    await smallZip(file, entries)
    const destination = await fs.mkdtemp(path.join(f.root, 'extract-'))
    await assert.rejects(extractProjectZip(file, destination, limits), match)
  }
  await rejects([['link', 'target', { mode: 0o120777 }]], /Links/)
  await rejects([['same.txt', 'a'], ['SAME.txt', 'b']], /duplicate/)
  await rejects([['large.bin', '123456']], { status: 413 }, { maxBytes: 2 })
  await rejects([['one.bin', 'a'], ['two.bin', 'b']], { status: 413 }, { maxEntries: 1 })
  await smallZip(file, [['aa/escape.txt', 'original-body']])
  let bytes = await fs.readFile(file)
  bytes = Buffer.from(bytes.toString('latin1').replaceAll('aa/escape.txt', '../escape.txt'), 'latin1')
  await fs.writeFile(file, bytes)
  await assert.rejects(extractProjectZip(file, path.join(f.root, 'traversal')), /invalid relative path|Unsafe|\.\./)
  await smallZip(file, [['file.txt', 'original-body']])
  bytes = await fs.readFile(file)
  bytes = Buffer.from(bytes.toString('latin1').replace('original-body', 'corruptd-body'), 'latin1')
  await fs.writeFile(file, bytes)
  await assert.rejects(extractProjectZip(file, path.join(f.root, 'checksum')), /checksum/)
})

test('authenticated endpoints stream a single-use export and import it as a new unpublished project', async (t) => {
  const f = await fixture(t)
  process.env.VR_SECURITY_ROOT = ':memory:'
  const app = express()
  app.use(express.json())
  app.use((req,_res,next) => { if(req.get('Authorization') === 'Bearer transfer-fixture') req.identity={user:{id:'transfer-fixture',role:'user'}}; next() })
  securityDb().prepare("INSERT OR REPLACE INTO grants(project,owner) VALUES(?,?)").run(f.project.id,'transfer-fixture')
  app.use('/api/project-transfers', createProjectTransfersRouter(express, { service: f.service, tempRoot: f.tempRoot }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  const base = `http://127.0.0.1:${server.address().port}`
  const token = 'transfer-fixture'
  const endpoint = `${base}/api/project-transfers/export/${f.project.id}`
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 401)
  const prepared = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}' })
  assert.equal(prepared.status, 200)
  const plan = await prepared.json()
  const download = await fetch(`${base}${plan.downloadUrl}`, {headers:{Authorization:`Bearer ${token}`}})
  assert.equal(download.status, 200)
  assert.match(download.headers.get('content-type'), /application\/zip/)
  const zip = Buffer.from(await download.arrayBuffer())
  assert.equal((await fetch(`${base}${plan.downloadUrl}`, {headers:{Authorization:`Bearer ${token}`}})).status, 404)
  assert.equal((await fetch(`${base}/api/project-transfers/import`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: zip })).status, 401)
  const imported = await fetch(`${base}/api/project-transfers/import`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' }, body: zip })
  assert.equal(imported.status, 201)
  assert.equal((await imported.json()).meta.isPublished, false)
  const previousLimit = process.env.MAX_PROJECT_IMPORT_BYTES
  process.env.MAX_PROJECT_IMPORT_BYTES = '1'
  try {
    const tooLarge = await fetch(`${base}/api/project-transfers/import`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' }, body: zip })
    assert.equal(tooLarge.status, 413)
    assert.match((await tooLarge.json()).error, /upload limit/)
  } finally { if (previousLimit === undefined) delete process.env.MAX_PROJECT_IMPORT_BYTES; else process.env.MAX_PROJECT_IMPORT_BYTES = previousLimit }
})
