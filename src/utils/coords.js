/**
 * Convert a Three.js world position on the panorama sphere to { yaw, pitch } in degrees.
 * yaw=0 is forward (-Z), increases clockwise when viewed from above.
 * pitch=0 is the horizon, positive is up.
 */
export function worldPointToYawPitch(point) {
  const len = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z)
  if (len === 0) return { yaw: 0, pitch: 0 }
  const nx = point.x / len
  const ny = point.y / len
  const nz = point.z / len

  const yaw = Math.atan2(nx, -nz) * (180 / Math.PI)
  const pitch = Math.asin(Math.max(-1, Math.min(1, ny))) * (180 / Math.PI)
  return { yaw, pitch }
}

/**
 * Generate a simple random id suitable for scene/hotspot ids.
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}
