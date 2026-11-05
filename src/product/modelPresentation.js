import * as THREE from 'three'

export const MODEL_TARGET_SIZE = 1.45

// Keep the imported hierarchy intact: animation tracks may animate its root.
export function normalizeInspectionModel(object, requestedScale = 1, upAxis = 'y') {
  const root = new THREE.Group()
  const orientation = new THREE.Group()
  orientation.rotation.x = upAxis === 'z' ? -Math.PI / 2 : 0
  orientation.rotation.z = upAxis === 'x' ? Math.PI / 2 : 0
  orientation.add(object)
  root.add(orientation)
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root, true)
  if (box.isEmpty()) throw new Error('This model contains no visible geometry.')
  const size = box.getSize(new THREE.Vector3())
  if (!size.toArray().every(Number.isFinite) || size.lengthSq() === 0) throw new Error('This model has no usable dimensions.')
  const fit = MODEL_TARGET_SIZE / Math.max(size.x, size.y, size.z, 0.0001)
  const scale = fit * Math.max(0.01, Number(requestedScale) || 1)
  const center = box.getCenter(new THREE.Vector3())
  orientation.position.set(-center.x, -box.min.y, -center.z)
  root.scale.setScalar(scale)
  root.updateMatrixWorld(true)
  return root
}

export function inspectionBounds(object) {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object, true)
  const size = box.getSize(new THREE.Vector3())
  return { size: size.toArray(), center: box.getCenter(new THREE.Vector3()).toArray(), radius: Math.max(0.01, size.length() / 2) }
}

// A bounding sphere fits at every rotation, including deep, wide and tall models.
export function inspectionFitDistance(radius, fov = 45, aspect = 1, padding = 1.16) {
  const vertical = THREE.MathUtils.degToRad(fov) / 2
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(0.1, aspect))
  return Math.max(0.1, radius) * padding / Math.sin(Math.min(vertical, horizontal))
}

export const INSPECTION_VIEWS = {
  front: [0, 0], back: [180, 0], left: [-90, 0], right: [90, 0], top: [0, 89], angle: [-35, 18],
}
