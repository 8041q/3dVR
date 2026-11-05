import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { uploadPanoramaFile } from '../src/uploads/resumablePanoramaUpload.js'
import { modelAssetDependencies } from '../src/offline/projectStore.js'

test('offline model dependencies include linked buffers and textures and skip embedded data', async () => {
  const model = {
    asset: { version: '2.0' },
    buffers: [{ uri: 'sample.bin' }],
    images: [{ uri: '../textures/detail.webp#fragment' }, { uri: 'data:image/png;base64,AA' }],
  }
  const json = Buffer.from(JSON.stringify(model))
  const header = Buffer.alloc(20)
  header.write('glTF')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(header.length + json.length, 8)
  header.writeUInt32LE(json.length, 12)
  header.write('JSON', 16)
  const expected = ['https://tour.test/models/sample.bin', 'https://tour.test/textures/detail.webp']
  assert.deepEqual(await modelAssetDependencies(new Blob([header, json]), 'https://tour.test/models/sample.glb'), expected)
  assert.deepEqual(await modelAssetDependencies(new Blob([json]), 'https://tour.test/models/sample.gltf'), expected)
  await assert.rejects(modelAssetDependencies(new Blob(['invalid']), 'https://tour.test/models/invalid.gltf'), /couldn’t be read/)
})

test('panorama upload resumes with the server offset and recovers a written chunk whose reply was lost', async (t) => {
  const calls = []
  const progress = []
  const file = new Blob(['0123456789'])
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.method, options.headers['Upload-Offset']])
    if (options.method === 'HEAD') {
      return new Response(null, { status: 204, headers: { 'Upload-Offset': 4, 'Upload-Length': 10, 'Upload-Chunk-Size': 2 } })
    }
    if (options.method === 'POST') return Response.json({ uploadId: 'test', jobId: 'job' })
    const offset = Number(options.headers['Upload-Offset'])
    if (offset === 4) return Response.json({}, { status: 409, headers: { 'Upload-Offset': 8 } })
    assert.equal(await options.body.text(), '89')
    return new Response(null, { status: 204, headers: { 'Upload-Offset': 10 } })
  })

  const result = await uploadPanoramaFile(file, { uploadId: 'test', onProgress: (update) => progress.push(update.uploadedBytes) })
  assert.deepEqual(result, { uploadId: 'test', jobId: 'job' })
  assert.deepEqual(progress, [4, 8, 10])
  assert.deepEqual(calls, [
    ['/api/panorama-uploads/test', 'HEAD', undefined],
    ['/api/panorama-uploads/test', 'PATCH', '4'],
    ['/api/panorama-uploads/test', 'PATCH', '8'],
    ['/api/panorama-uploads/test/complete', 'POST', undefined],
  ])
})

test('server rejects overlapping chunks and completes the same upload after a lost response', async (t) => {
  const storage = await mkdtemp(fileURLToPath(new URL('./.panorama-upload-', import.meta.url)))
  process.env.VR_STORAGE_ROOT = storage
  t.after(async () => { delete process.env.VR_STORAGE_ROOT; await rm(storage, { recursive: true, force: true }) })
  const { createPanoramaUploadsRouter } = await import('../server/panoramaUploads.js')
  const routes = new Map()
  const express = {
    Router() {
      return Object.fromEntries(['post', 'head', 'patch'].map((verb) => [verb, (route, ...handlers) => {
        routes.set(`${verb} ${route}`, handlers.at(-1))
      }]))
    },
    raw() {},
  }
  createPanoramaUploadsRouter(express)

  async function request(route, uploadId, body, offset) {
    const response = {
      headers: {},
      set(name, value) { this.headers[name] = value; return this },
      status(value) { this.code = value; return this },
      json(value) { this.body = value; return this },
      end() { return this },
    }
    await routes.get(route)({ params: { uploadId }, body, get: () => offset }, response)
    return response
  }

  const created = await request('post /', null, { filename: 'master.png', size: 4 })
  const { uploadId } = created.body
  const overlapping = await Promise.all([0, 1].map(() => request('patch /:uploadId', uploadId, Buffer.from('ab'), '0')))
  assert.deepEqual(overlapping.map((result) => result.code).sort(), [204, 409])
  assert.equal((await request('head /:uploadId', uploadId)).headers['Upload-Offset'], '2')
  await request('patch /:uploadId', uploadId, Buffer.from('cd'), '2')

  // Simulate interruption after metadata inspection but before the queue
  // entry was written. Tests do not require the optional FFmpeg executable.
  const file = path.join(storage, 'incoming', `${uploadId}.json`)
  const record = JSON.parse(await readFile(file, 'utf8'))
  record.finalization = {
    metadata: { width: 200, height: 100, format: 'png' },
    masterPath: path.join(storage, 'masters', `${uploadId}.png`),
  }
  await writeFile(file, JSON.stringify(record))
  const first = await request('post /:uploadId/complete', uploadId)
  const repeated = await request('post /:uploadId/complete', uploadId)
  assert.equal(first.code, 201)
  assert.equal(repeated.code, 200)
  assert.equal(repeated.body.jobId, first.body.jobId)
  assert.equal((await request('head /:uploadId', uploadId)).headers['Upload-Offset'], '4')
  assert.equal(await readFile(record.finalization.masterPath, 'utf8'), 'abcd')
})

test('offline worker uses the matching project copy only after a network failure', async () => {
  const handlers = new Map()
  const origin = 'https://viewer.test'
  const route = `${origin}/v/exhibition`
  const url = `${origin}/uploads/room.glb`
  const calls = []
  const context = {
    URL, Headers, Response,
    self: {
      location: { origin },
      addEventListener: (name, handler) => handlers.set(name, handler),
      clients: { get: async () => ({ url: route }) },
    },
    fetch: async () => new Response('network'),
    caches: {
      has: async (name) => name === 'shell-exhibition',
      open: async () => ({
        match: async (request) => request === `${origin}/index.html` ? new Response('verified shell')
          : request.url === `${origin}/assets/viewer.js` ? new Response('saved viewer script') : null,
      }),
    },
  }
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context)
  context.downloadedCopy = async (id, requestUrl) => {
    calls.push(id)
    if (id !== 'exhibition') return {}
    return {
      project: { id, copyId: 'copy', shell: { cacheName: 'shell-exhibition', indexUrl: `${origin}/index.html` } },
      asset: requestUrl === url ? { blob: new Blob(['exhibition copy']), type: 'model/gltf-binary' } : null,
    }
  }

  function read(request) {
    return new Promise((resolve) => handlers.get('fetch')({
      request: { method: 'GET', headers: new Headers(), ...request },
      clientId: 'viewer',
      respondWith: resolve,
    }))
  }

  assert.equal(await (await read({ url })).text(), 'network')
  assert.deepEqual(calls, [])
  context.fetch = async () => { throw new Error('No network') }
  assert.equal(await (await read({ url })).text(), 'exhibition copy')
  assert.equal(await (await read({ url: route, mode: 'navigate' })).text(), 'verified shell')
  assert.equal(await (await read({ url: `${origin}/assets/viewer.js`, cache: 'reload', destination: 'script' })).text(), 'saved viewer script')
  assert.deepEqual(calls, ['exhibition', 'exhibition', 'exhibition'])
  await assert.rejects(read({ url, cache: 'reload' }), /No network/)
})
