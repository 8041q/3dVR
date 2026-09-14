import * as THREE from 'three'

export const FACE_TRANSFORMS = {
  f: { position: [0, 0, -1], rotation: [0, 0, 0] },
  b: { position: [0, 0, 1], rotation: [0, Math.PI, 0] },
  r: { position: [1, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  l: { position: [-1, 0, 0], rotation: [0, Math.PI / 2, 0] },
  u: { position: [0, 1, 0], rotation: [Math.PI / 2, 0, 0] },
  d: { position: [0, -1, 0], rotation: [-Math.PI / 2, 0, 0] },
}

export function tilePlaneTransform(face, level, row, col, radius = 10, inset = 0) {
  const transform = FACE_TRANSFORMS[face]
  if (!transform) throw new Error(`Unknown cubemap face: ${face}`)

  const cols = level.cols
  const rows = level.rows
  const tileWidth = 2 * radius / cols
  const tileHeight = 2 * radius / rows
  const localX = -radius + tileWidth * (col + 0.5)
  const localY = radius - tileHeight * (row + 0.5)

  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation))
  const localCenter = new THREE.Vector3(localX, localY, 0)
    .applyQuaternion(quaternion)
  const normalOffset = new THREE.Vector3(...transform.position).multiplyScalar(radius - inset)

  return {
    position: localCenter.add(normalOffset).toArray(),
    rotation: transform.rotation,
    scale: [tileWidth, tileHeight, 1],
  }
}

export function fillTileUrl(template, { level, face, row, col }) {
  return template
    .replace('{level}', String(level))
    .replace('{face}', face)
    .replace('{row}', String(row))
    .replace('{col}', String(col))
}
