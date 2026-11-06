import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import express from 'express'
import { cachedModelThumbnail, saveModelThumbnail } from '../server/assetThumbnails.js'

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '.atria-thumbnails-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const publicRoot = path.join(root, 'public'), cacheRoot = path.join(root, 'thumbnails')
  await fs.mkdir(path.join(publicRoot, 'uploads'), { recursive: true })
  await fs.mkdir(path.join(publicRoot, 'demo'))
  const source = path.join(publicRoot, 'uploads', 'room.glb')
  await fs.writeFile(source, 'model fixture')
  return { publicRoot, cacheRoot, source, version: (await fs.stat(source)).mtime.toISOString() }
}

test('model thumbnails reject traversal, foreign files, stale captures and invalid image bodies', async t => {
  const { publicRoot, cacheRoot, version } = await fixture(t)
  for (const url of ['/uploads/../room.glb', '/uploads/%2e%2e/room.glb', '/uploads/%5croom.glb', '/demo/../uploads/room.glb', 'https://evil.test/room.glb', '/uploads/room.png']) {
    assert.equal(await cachedModelThumbnail(url, publicRoot, cacheRoot), null, url)
    await assert.rejects(saveModelThumbnail(url, version, Buffer.from('invalid'), publicRoot, cacheRoot), { status: 404 })
  }
  await assert.rejects(saveModelThumbnail('/uploads/room.glb', 'old version', Buffer.alloc(32), publicRoot, cacheRoot), { status: 409 })
  for (const bytes of [Buffer.from('<svg onload="alert(1)">'), Buffer.alloc(256 * 1024 + 1), { arbitrary: 'json' }]) {
    await assert.rejects(saveModelThumbnail('/uploads/room.glb', version, bytes, publicRoot, cacheRoot), { status: 415 })
  }
})

test('model thumbnails persist as small WebP images and invalidate when the source changes', async t => {
  if (spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status !== 0 || spawnSync('ffprobe', ['-version'], { windowsHide: true }).status !== 0) {
    t.skip('FFmpeg and FFprobe are required for thumbnail encoding.'); return
  }
  const { publicRoot, cacheRoot, source, version } = await fixture(t)
  const image = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=480x320', '-frames:v', '1', '-c:v', 'libwebp', '-f', 'webp', 'pipe:1'], { windowsHide: true })
  assert.equal(image.status, 0, image.stderr?.toString())
  assert.equal(await cachedModelThumbnail('/uploads/room.glb', publicRoot, cacheRoot), null)
  const thumbnail = await saveModelThumbnail('/uploads/room.glb', version, image.stdout, publicRoot, cacheRoot)
  assert.equal(await cachedModelThumbnail('/uploads/room.glb', publicRoot, cacheRoot), thumbnail)
  assert.ok((await fs.stat(thumbnail)).size < 256 * 1024)
  assert.equal((await fs.readFile(thumbnail)).toString('ascii', 8, 12), 'WEBP')
  const previousRoot = process.env.VR_STORAGE_ROOT
  process.env.VR_STORAGE_ROOT = path.dirname(publicRoot)
  t.after(() => { if (previousRoot === undefined) delete process.env.VR_STORAGE_ROOT; else process.env.VR_STORAGE_ROOT = previousRoot })
  const { createAssetsRouter } = await import('../server/assets.js')
  const app = express()
  app.use('/api/assets', createAssetsRouter(express))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/assets/thumbnail?url=%2Fuploads%2Froom.glb`)
  assert.equal(response.status, 200, 'private caches work even when the storage directory has a dot prefix')
  assert.match(response.headers.get('content-type'), /image\/webp/)
  assert.match(response.headers.get('cache-control'), /private/)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(thumbnail))
  // Replacing a thumbnail does not accumulate a file for every capture.
  await saveModelThumbnail('/uploads/room.glb', version, image.stdout, publicRoot, cacheRoot)
  assert.equal((await fs.readdir(cacheRoot)).length, 1)
  await fs.writeFile(source, 'a replacement model with different content')
  assert.equal(await cachedModelThumbnail('/uploads/room.glb', publicRoot, cacheRoot), null)
})
