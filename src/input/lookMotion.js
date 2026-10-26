export const PITCH_LIMIT = Math.PI / 2 - 0.03
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// Exponential damping has the same response at 30, 60 and 144 Hz.
export function damp(current, target, delta, speed = 18) {
  const next = current + (target - current) * (1 - Math.exp(-speed * clamp(delta, 0, 0.1)))
  return Math.abs(next - target) < 0.00001 ? target : next
}

export function nearestAngle(current, target) {
  return current + Math.atan2(Math.sin(target - current), Math.cos(target - current))
}

export function pointerSensitivity(fov, height) {
  return (fov * Math.PI / 180) / Math.max(240, height)
}

export function wheelPixels(event, height) {
  return clamp(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1), -240, 240)
}
