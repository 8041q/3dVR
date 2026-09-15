import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

const zee = new THREE.Vector3(0, 0, 1)
const euler = new THREE.Euler()
const q0 = new THREE.Quaternion()
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
const rawQuaternion = new THREE.Quaternion()
const yawCorrection = new THREE.Quaternion()
const forward = new THREE.Vector3()
const yAxis = new THREE.Vector3(0, 1, 0)
const touchCorrection = new THREE.Quaternion()
const touchEuler = new THREE.Euler(0, 0, 0, 'YXZ')

function screenOrientationRadians() {
  const angle = window.screen?.orientation?.angle
  if (Number.isFinite(angle)) return THREE.MathUtils.degToRad(angle)
  const legacy = Number(window.orientation)
  return THREE.MathUtils.degToRad(Number.isFinite(legacy) ? legacy : 0)
}

function quaternionFromOrientation(target, alpha, beta, gamma, orient) {
  euler.set(beta, alpha, -gamma, 'YXZ')
  target.setFromEuler(euler)
  target.multiply(q1)
  target.multiply(q0.setFromAxisAngle(zee, -orient))
  return target
}

function horizontalYawFromQuaternion(quaternion) {
  forward.set(0, 0, -1).applyQuaternion(quaternion)
  forward.y = 0
  if (forward.lengthSq() < 1e-8) return 0
  forward.normalize()
  return Math.atan2(-forward.x, -forward.z)
}

/**
 * Device-orientation panorama control.
 *
 * The first valid sensor pose is yaw-calibrated to panorama forward so opening
 * Phone mode never depends on the phone's compass heading. Pitch/roll remain
 * physical. Recenter repeats the yaw calibration at the visitor's current pose.
 */
const PhoneOrientationControls = forwardRef(function PhoneOrientationControls({
  enabled,
  permissionState = 'unknown',
  onStatusChange,
  touchEnabled = false,
  fov = 75,
}, ref) {
  const { camera, gl } = useThree()
  const state = useRef({
    alpha: null,
    beta: null,
    gamma: null,
    screen: 0,
    events: 0,
    lastEventAt: 0,
    calibrated: false,
    yawOffset: 0,
    status: 'inactive',
    statusDetail: '',
    statusReportedAt: 0,
    touchYaw: 0,
    touchPitch: 0,
    pointerId: null,
    pointerX: 0,
    pointerY: 0,
  })

  const report = (status, detail = '') => {
    const current = state.current
    if (current.status === status && current.statusDetail === detail) return
    current.status = status
    current.statusDetail = detail
    current.statusReportedAt = performance.now()
    onStatusChange?.({ status, detail, events: current.events })
  }

  const calibrate = () => {
    const current = state.current
    current.calibrated = false
    if (current.alpha == null) return false
    quaternionFromOrientation(
      rawQuaternion,
      THREE.MathUtils.degToRad(current.alpha || 0),
      THREE.MathUtils.degToRad(current.beta || 0),
      THREE.MathUtils.degToRad(current.gamma || 0),
      current.screen,
    )
    current.yawOffset = -horizontalYawFromQuaternion(rawQuaternion)
    current.touchYaw = 0
    current.touchPitch = 0
    current.calibrated = true
    report('active', 'Motion active')
    return true
  }

  useImperativeHandle(ref, () => ({
    recenter: calibrate,
    getStatus: () => ({
      status: state.current.status,
      detail: state.current.statusDetail,
      events: state.current.events,
    }),
  }))

  useEffect(() => {
    const current = state.current
    current.alpha = null
    current.beta = null
    current.gamma = null
    current.events = 0
    current.lastEventAt = 0
    current.calibrated = false
    current.yawOffset = 0
    current.screen = screenOrientationRadians()

    if (!enabled) {
      report('inactive', '')
      return undefined
    }

    if (!window.isSecureContext) {
      report('insecure', 'Phone motion requires HTTPS on this browser.')
      return undefined
    }

    if (permissionState === 'denied') {
      report('denied', 'Motion permission was denied.')
      return undefined
    }

    if (!('DeviceOrientationEvent' in window)) {
      report('unsupported', 'This browser does not expose device orientation.')
      return undefined
    }

    report('waiting', permissionState === 'granted' ? 'Waiting for motion data…' : 'Waiting for motion permission/data…')

    const device = (event) => {
      if (event.alpha == null && event.beta == null && event.gamma == null) return
      current.alpha = Number(event.alpha) || 0
      current.beta = Number(event.beta) || 0
      current.gamma = Number(event.gamma) || 0
      current.events += 1
      current.lastEventAt = performance.now()
      if (!current.calibrated) calibrate()
      else report('active', 'Motion active')
    }

    const updateScreen = () => {
      current.screen = screenOrientationRadians()
      // Screen rotation changes the device-to-camera transform. Recalibrating
      // yaw avoids a sudden compass-dependent jump when entering headset mode.
      current.calibrated = false
    }

    window.addEventListener('deviceorientation', device, true)
    window.addEventListener('orientationchange', updateScreen)
    window.screen?.orientation?.addEventListener?.('change', updateScreen)

    const watchdog = window.setInterval(() => {
      if (!enabled || current.events > 0) return
      report('waiting', 'No orientation data received yet. Check HTTPS and browser motion permission.')
    }, 1800)

    return () => {
      window.clearInterval(watchdog)
      window.removeEventListener('deviceorientation', device, true)
      window.removeEventListener('orientationchange', updateScreen)
      window.screen?.orientation?.removeEventListener?.('change', updateScreen)
    }
  }, [enabled, permissionState])

  useEffect(() => {
    const element = gl.domElement
    if (!enabled || !touchEnabled || !element) return undefined

    const down = (event) => {
      if (event.pointerType !== 'touch') return
      const current = state.current
      current.pointerId = event.pointerId
      current.pointerX = event.clientX
      current.pointerY = event.clientY
      try { element.setPointerCapture?.(event.pointerId) } catch {}
    }

    const move = (event) => {
      const current = state.current
      if (current.pointerId !== event.pointerId) return
      const dx = event.clientX - current.pointerX
      const dy = event.clientY - current.pointerY
      current.pointerX = event.clientX
      current.pointerY = event.clientY
      current.touchYaw += dx * 0.0045
      current.touchPitch = THREE.MathUtils.clamp(current.touchPitch + dy * 0.0035, -Math.PI * 0.42, Math.PI * 0.42)
    }

    const up = (event) => {
      if (state.current.pointerId === event.pointerId) state.current.pointerId = null
    }

    element.addEventListener('pointerdown', down, { passive: true })
    element.addEventListener('pointermove', move, { passive: true })
    element.addEventListener('pointerup', up, { passive: true })
    element.addEventListener('pointercancel', up, { passive: true })
    return () => {
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
    }
  }, [enabled, gl, touchEnabled])

  useEffect(() => {
    if (!enabled) return
    const next = THREE.MathUtils.clamp(Number(fov) || 75, 35, 120)
    if (Math.abs(camera.fov - next) > 0.01) {
      camera.fov = next
      camera.updateProjectionMatrix()
    }
  }, [camera, enabled, fov])

  useFrame(() => {
    const current = state.current
    if (!enabled || current.alpha == null) return

    quaternionFromOrientation(
      rawQuaternion,
      THREE.MathUtils.degToRad(current.alpha || 0),
      THREE.MathUtils.degToRad(current.beta || 0),
      THREE.MathUtils.degToRad(current.gamma || 0),
      current.screen,
    )

    if (!current.calibrated) calibrate()
    yawCorrection.setFromAxisAngle(yAxis, current.yawOffset)
    touchEuler.set(current.touchPitch, current.touchYaw, 0)
    touchCorrection.setFromEuler(touchEuler)
    camera.quaternion.copy(yawCorrection).multiply(touchCorrection).multiply(rawQuaternion)
  })

  return null
})

export default PhoneOrientationControls

export function phoneMotionEnvironment() {
  if (!window.isSecureContext) {
    return { supported: false, reason: 'Phone motion requires HTTPS on this browser.', code: 'insecure' }
  }
  if (!('DeviceOrientationEvent' in window)) {
    return { supported: false, reason: 'This browser does not expose device orientation.', code: 'unsupported' }
  }
  return { supported: true, reason: '', code: 'available' }
}

export async function requestPhoneMotionPermission() {
  const environment = phoneMotionEnvironment()
  if (!environment.supported) return { granted: false, ...environment }

  const orientationApi = window.DeviceOrientationEvent
  try {
    if (typeof orientationApi?.requestPermission !== 'function') {
      return { granted: true, code: 'granted', reason: '' }
    }

    const granted = (await orientationApi.requestPermission()) === 'granted'
    return {
      granted,
      code: granted ? 'granted' : 'denied',
      reason: granted ? '' : 'Motion permission was denied by the browser.',
    }
  } catch (error) {
    return {
      granted: false,
      code: 'error',
      reason: error?.message || 'Could not request motion permission.',
    }
  }
}
