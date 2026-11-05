import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as THREE from 'three'
import { detectModelMetadata, replaceProductModel } from '../src/product/modelMetadata.js'
import { applyMaterialVariant, resetObjectMaterials, resolveAnimationControls } from '../src/product/productControls.js'

function model() {
  const material = new THREE.MeshStandardMaterial({ name: 'frame', color: '#ffffff' })
  const object = new THREE.Group()
  object.add(new THREE.Mesh(new THREE.BoxGeometry(), material))
  return { object, material }
}

test('an unavailable finish keeps the previous material and a later valid choice still works', async (t) => {
  t.mock.method(THREE.TextureLoader.prototype, 'load', (_url, _onLoad, _onProgress, onError) => {
    onError(new Error('File missing'))
  })
  t.mock.method(console, 'warn', () => {})
  const { object, material } = model()

  assert.equal(await applyMaterialVariant(object, { materialName: 'frame', color: '#ff0000', roughness: 0.4 }), true)
  assert.equal(await applyMaterialVariant(object, { materialName: 'missing', color: '#000000' }), false)
  assert.equal(await applyMaterialVariant(object, { materialName: 'frame', textureUrl: '/missing.png' }), false)
  assert.equal(material.color.getHexString(), 'ff0000')
  assert.equal(material.roughness, 0.4)

  assert.equal(await applyMaterialVariant(object, { materialName: 'frame', color: '#0000ff' }), true)
  assert.equal(material.color.getHexString(), '0000ff')
  assert.equal(material.roughness, 1)
})

test('a pending texture cannot overwrite a more recent choice of Original', async (t) => {
  let finishTextureLoad
  t.mock.method(THREE.TextureLoader.prototype, 'load', (_url, onLoad) => {
    finishTextureLoad = onLoad
  })
  const { object, material } = model()
  const texture = new THREE.Texture()
  let disposed = false
  texture.addEventListener('dispose', () => { disposed = true })
  assert.equal(await applyMaterialVariant(object, { color: '#ff0000' }), true)

  const pending = applyMaterialVariant(object, { textureUrl: '/blue.png' })
  assert.equal(material.color.getHexString(), 'ff0000')
  resetObjectMaterials(object)
  finishTextureLoad(texture)

  assert.equal(await pending, false)
  assert.equal(disposed, true)
  assert.equal(material.color.getHexString(), 'ffffff')
  assert.equal(material.map, null)
})

test('visitor animation controls only reference clips present in the loaded model', () => {
  const inspection = { animationControls: [
    { id: 'legacy', clip: 'Door', label: 'Open door' },
    { id: 'known', clip: 'Drawer', label: 'Open drawer' },
  ] }
  assert.deepEqual(resolveAnimationControls(inspection, ['Drawer', 'Headrest', 'Headrest']), [
    { id: 'known', clip: 'Drawer', label: 'Open drawer' },
    { id: 'auto-Headrest', clip: 'Headrest', label: 'Headrest' },
  ])
  assert.deepEqual(resolveAnimationControls({ ...inspection, exposeAnimations: false }, ['Headrest']), [])
})

test('checking a real GLB discovers choices and a replacement preserves annotation placement for review', async () => {
  const demo = await readFile(new URL('../public/demo/product-demo.glb', import.meta.url))
  const metadata = await detectModelMetadata(`data:application/octet-stream;base64,${demo.toString('base64')}`)
  assert.ok(metadata.clips.includes('Open drawer'))
  assert.ok(metadata.materials.length > 0)
  assert.ok(metadata.nodes.length > 0)

  const previous = { modelUrl: '/demo/old.glb', annotations: [{ id: 'detail', position: [1, 2, 3] }] }
  assert.deepEqual(replaceProductModel(previous, '/demo/new.glb'), {
    modelUrl: '/demo/new.glb',
    annotations: [{ id: 'detail', position: [1, 2, 3], needsPlacementReview: true }],
  })
  assert.equal(previous.annotations[0].needsPlacementReview, undefined)
  assert.equal(replaceProductModel(previous, previous.modelUrl), null)
})
