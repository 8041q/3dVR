import * as THREE from 'three'

export function phoneMotionEnvironment(source = window) {
  if (!source.isSecureContext) return { supported: false, reason: 'Motion needs a secure link (https://).', code: 'insecure' }
  if (!source.DeviceOrientationEvent) return { supported: false, reason: 'No motion sensor is available in this browser.', code: 'unsupported' }
  return { supported: true, reason: '', code: 'available' }
}

export async function requestPhoneMotionPermission(source = window) {
  const environment = phoneMotionEnvironment(source)
  if (!environment.supported) return { granted: false, ...environment }
  try {
    const permission = source.DeviceOrientationEvent.requestPermission
    const granted = typeof permission !== 'function' || await permission.call(source.DeviceOrientationEvent) === 'granted'
    return { granted, code: granted ? 'granted' : 'denied', reason: granted ? '' : 'Motion access was denied. Allow motion sensors in your browser’s site settings.' }
  } catch (error) {
    return { granted: false, code: 'error', reason: error.message || 'Motion could not start.' }
  }
}

// The sensor session is independent of single-screen / stereo rendering.
export function createPhoneOrientation({ camera, source = window, onStatus, now = () => performance.now() }) {
  const raw = new THREE.Quaternion()
  const correction = new THREE.Quaternion()
  const touch = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const forward = new THREE.Vector3()
  const yAxis = new THREE.Vector3(0, 1, 0)
  const zAxis = new THREE.Vector3(0, 0, 1)
  const phoneToCamera = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
  let pose = null, yawOffset = 0, touchYaw = 0, touchPitch = 0, calibrated = false
  let events = 0, lastEventAt = 0, timer = null, listening = false
  let status = { status: 'inactive', detail: '', events: 0 }
  const report = (next, detail = '') => {
    if (status.status === next && status.detail === detail) return
    status = { status: next, detail, events }
    onStatus?.(status)
  }
  const yaw = (quaternion) => {
    forward.set(0, 0, -1).applyQuaternion(quaternion); forward.y = 0
    return forward.lengthSq() < 1e-8 ? 0 : Math.atan2(-forward.x, -forward.z)
  }
  const readQuaternion = () => {
    const angle = source.screen?.orientation?.angle ?? source.orientation ?? 0
    euler.set(THREE.MathUtils.degToRad(pose.beta), THREE.MathUtils.degToRad(pose.alpha), THREE.MathUtils.degToRad(-pose.gamma), 'YXZ')
    raw.setFromEuler(euler).multiply(phoneToCamera).multiply(correction.setFromAxisAngle(zAxis, THREE.MathUtils.degToRad(-angle)))
  }
  const calibrate = (targetYaw = 0) => {
    if (!pose) return false
    readQuaternion()
    yawOffset = targetYaw - yaw(raw)
    touchYaw = 0; touchPitch = 0; calibrated = true
    return true
  }
  const device = (event) => {
    if (!listening) return
    if (![event.alpha, event.beta, event.gamma].some((value) => value != null && Number.isFinite(value))) return
    pose = { alpha: Number(event.alpha) || 0, beta: Number(event.beta) || 0, gamma: Number(event.gamma) || 0 }
    events += 1; lastEventAt = now()
    if (!calibrated) calibrate(yaw(camera.quaternion))
    report('active', 'Move your phone to look around.')
  }
  const rotateScreen = () => { calibrated = false }
  const stop = () => {
    if (timer !== null) source.clearInterval(timer)
    timer = null
    source.removeEventListener('deviceorientation', device, { capture: true })
    source.removeEventListener('deviceorientationabsolute', device, { capture: true })
    source.removeEventListener('orientationchange', rotateScreen)
    source.screen?.orientation?.removeEventListener?.('change', rotateScreen)
    pose = null; listening = false
    report('inactive')
  }
  return {
    start(permissionState = 'unknown') {
      stop()
      pose = null; events = 0; calibrated = false; lastEventAt = now()
      const environment = phoneMotionEnvironment(source)
      if (!environment.supported) { report(environment.code, environment.reason); return stop }
      if (permissionState === 'denied' || permissionState === 'error') {
        report(permissionState, 'Motion access is blocked. Allow motion sensors in your browser’s site settings, then select Phone VR again.')
        return stop
      }
      listening = true
      report('waiting', 'Starting gyroscope… Move your phone to look around.')
      source.addEventListener('deviceorientation', device, { capture: true })
      source.addEventListener('deviceorientationabsolute', device, { capture: true })
      source.addEventListener('orientationchange', rotateScreen)
      source.screen?.orientation?.addEventListener?.('change', rotateScreen)
      timer = source.setInterval(() => {
        if (now() - lastEventAt < 3000) return
        pose = null; calibrated = false
        report('waiting', 'No motion data is arriving. Check that motion sensors are allowed in your browser’s site settings.')
      }, 1800)
      return stop
    },
    stop,
    recenter: () => calibrate(),
    getStatus: () => ({ ...status, events }),
    addTouch(dx, dy) {
      touchYaw += dx * 0.0045
      touchPitch = THREE.MathUtils.clamp(touchPitch + dy * 0.0035, -Math.PI * 0.42, Math.PI * 0.42)
    },
    update() {
      if (!listening || !pose) return
      readQuaternion()
      correction.setFromAxisAngle(yAxis, yawOffset)
      touch.setFromEuler(euler.set(touchPitch, touchYaw, 0, 'YXZ'))
      camera.quaternion.copy(correction).multiply(touch).multiply(raw)
    },
  }
}
