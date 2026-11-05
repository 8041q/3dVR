import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { normalizeInspectionModel, inspectionBounds, inspectionFitDistance } from '../src/product/modelPresentation.js'

test('inspection centres and grounds models of different shapes without changing imported transforms', () => {
  for (const dimensions of [[0.01, 20, 0.03], [30, 0.1, 2], [1, 2, 40]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions))
    mesh.position.set(100, -90, 70)
    mesh.scale.set(2, 3, 4)
    const originalPosition = mesh.position.clone()
    const originalScale = mesh.scale.clone()
    const root = normalizeInspectionModel(mesh)
    const bounds = new THREE.Box3().setFromObject(root, true)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    assert.ok(Math.abs(Math.max(...size.toArray()) - 1.45) < 1e-6)
    assert.ok(Math.abs(center.x) < 1e-6 && Math.abs(center.z) < 1e-6 && Math.abs(bounds.min.y) < 1e-6)
    assert.deepEqual(mesh.position, originalPosition)
    assert.deepEqual(mesh.scale, originalScale)
  }
})

test('Y, Z and X up imports use the same grounded coordinates for placement and inspection', () => {
  for (const [axis, dimensions] of [['y', [1, 5, 1]], ['z', [1, 1, 5]], ['x', [5, 1, 1]]]) {
    const root = normalizeInspectionModel(new THREE.Mesh(new THREE.BoxGeometry(...dimensions)), 1, axis)
    const { size, center } = inspectionBounds(root)
    assert.ok(Math.abs(size[1] - 1.45) < 1e-6, axis)
    assert.ok(Math.abs(center[1] - 0.725) < 1e-6, axis)
  }
})

test('bounding sphere fits every model rotation in portrait and landscape viewports', () => {
  for (const dimensions of [[0.1, 9, 0.2], [9, 1, 6], [1, 2, 9]]) {
    const model = normalizeInspectionModel(new THREE.Mesh(new THREE.BoxGeometry(...dimensions)))
    const { radius, center } = inspectionBounds(model)
    for (const aspect of [0.38, 0.7, 1, 2.4]) {
      const distance = inspectionFitDistance(radius, 45, aspect)
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.001, 100)
      camera.position.set(0, 0, distance)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld(true)
      for (const angles of [[0, 0, 0], [0.8, 1.2, 0], [Math.PI / 2, 0, 0]]) {
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles))
        const geometry = model.children[0].children[0].geometry
        const positions = geometry.attributes.position
        for (let i = 0; i < positions.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i)
            .applyMatrix4(model.children[0].children[0].matrixWorld)
            .sub(new THREE.Vector3(...center)).applyQuaternion(rotation).project(camera)
          assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && point.z < 1, `${dimensions} at ${aspect}`)
        }
      }
    }
  }
})

test('inspection rejects empty models with an actionable error', () => {
  assert.throws(() => normalizeInspectionModel(new THREE.Group()), /no visible geometry/)
})

test('normalisation preserves animated node bindings and the model’s scale', () => {
  const model = new THREE.Group()
  const part = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1))
  part.name = 'Drawer'
  model.add(part)
  const root = normalizeInspectionModel(model, 2)
  const originalScale = root.scale.clone()
  const clip = new THREE.AnimationClip('Open', 1, [new THREE.VectorKeyframeTrack('Drawer.position', [0, 1], [0, 0, 0, 0, 0, 2])])
  const mixer = new THREE.AnimationMixer(model)
  const animation = mixer.clipAction(clip)
  animation.setLoop(THREE.LoopOnce, 1)
  animation.clampWhenFinished = true
  animation.play()
  mixer.update(1)
  assert.equal(part.position.z, 2)
  assert.deepEqual(root.scale, originalScale)
  assert.equal(root.getObjectByName('Drawer'), part)
})
