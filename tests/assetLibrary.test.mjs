import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { assetUsage, filterAssets, uploadAssetBatch } from '../src/editor/assetLibrary.js'
import { imageAssetPath } from '../server/assetThumbnails.js'

const assets = [
  { name: 'Room 10.png', url: '/uploads/room.png', type: 'image', bytes: 500, updatedAt: '2026-11-01', extension: '.png' },
  { name: 'Room 2.glb', url: '/uploads/bed.glb', type: 'model', bytes: 2000, updatedAt: '2026-11-02', extension: '.glb' },
  { name: 'Poster.webp', url: '/uploads/poster.webp', type: 'image', bytes: 300, updatedAt: '2026-11-03', extension: '.webp' },
]
const project = { scenes: [{ id: 'room', title: 'Showroom', image: assets[0].url, hotspots: [{ actions: [{ modelUrl: assets[1].url }] }] }] }

test('asset usage includes nested product assets and filters keep search, type, usage and sort together', () => {
  assert.deepEqual(assetUsage(project, assets[1].url), [{ kind: 'Scene', label: 'Showroom' }])
  assert.deepEqual(filterAssets(assets, { usage: 'unused' }, project), [assets[2]])
  assert.deepEqual(filterAssets(assets, { query: '.png', usage: 'used', type: 'image' }, project), [assets[0]])
  assert.deepEqual(filterAssets(assets, { sort: 'largest' }, project), [assets[1], assets[0], assets[2]])
  assert.deepEqual(filterAssets(assets, { sort: 'name' }, project), [assets[2], assets[1], assets[0]])
  assert.equal(assets[0].name, 'Room 10.png')
})

test('batch uploads stay sequential, skip duplicate selections and continue after a failed file', async () => {
  const files = ['first.png', 'broken.glb', 'last.png'].map((name) => ({ name, size: 1, lastModified: 1 }))
  let active = 0
  const result = await uploadAssetBatch([...files, files[0]], async (file) => {
    assert.equal(active++, 0)
    await Promise.resolve(); active--
    if (file.name === 'broken.glb') throw new Error('No space')
  }, () => {})
  assert.deepEqual(result.map((entry) => entry.status), ['complete', 'failed', 'complete'])
  assert.equal(result[1].error, 'No space')
})

test('image thumbnails only resolve local image files inside uploads or demo', () => {
  const root = path.resolve('public')
  assert.equal(imageAssetPath('/uploads/Room%20one.png', root), path.join(root, 'uploads', 'Room one.png'))
  for (const url of ['/uploads/../secret.png', '/uploads/%2e%2e/secret.png', '/uploads/%5csecret.png', '/uploads/bed.glb', 'https://example.test/image.png', '/api/secret.png', '/uploads/%broken']) {
    assert.equal(imageAssetPath(url, root), null, url)
  }
})
