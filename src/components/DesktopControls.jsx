import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { clamp, damp, nearestAngle, PITCH_LIMIT, pointerSensitivity, wheelPixels } from '../input/lookMotion'

export default function DesktopControls({ enabled = true, invertX = true, invertY = true, focusRequest = null, viewRef = null, controlledFov = null }) {
  const { camera, gl } = useThree()
  const state = useRef({ yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0, fov: 75, pointerId: null, focusId: null })

  useEffect(() => {
    const current = state.current
    if (!enabled) return undefined
    const pose = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    current.yaw = current.targetYaw = pose.y
    current.pitch = current.targetPitch = pose.x
    current.fov = camera.fov
    const element = gl.domElement
    const previousTouchAction = element.style.touchAction
    element.style.touchAction = 'none'
    const stop = (event) => {
      if (event?.pointerId != null && event.pointerId !== current.pointerId) return
      const id = current.pointerId
      current.pointerId = null
      if (id != null && element.hasPointerCapture?.(id)) element.releasePointerCapture(id)
      element.style.cursor = ''
    }
    const down = (event) => {
      if (event.button !== 0 || current.pointerId != null) return
      current.pointerId = event.pointerId
      current.x = event.clientX
      current.y = event.clientY
      element.style.cursor = 'grabbing'
      element.setPointerCapture?.(event.pointerId)
    }
    const move = (event) => {
      if (event.pointerId !== current.pointerId) return
      const sensitivity = pointerSensitivity(camera.fov, element.clientHeight)
      current.targetYaw += (event.clientX - current.x) * sensitivity * (invertX ? 1 : -1)
      current.targetPitch = clamp(current.targetPitch + (event.clientY - current.y) * sensitivity * (invertY ? 1 : -1), -PITCH_LIMIT, PITCH_LIMIT)
      current.x = event.clientX
      current.y = event.clientY
    }
    const wheel = (event) => {
      event.preventDefault()
      if (controlledFov != null) return
      current.fov = clamp(current.fov + wheelPixels(event, element.clientHeight) * 0.045, 35, 95)
    }
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', stop)
    element.addEventListener('pointercancel', stop)
    element.addEventListener('lostpointercapture', stop)
    element.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('blur', stop)
    return () => {
      stop()
      element.style.touchAction = previousTouchAction
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', stop)
      element.removeEventListener('pointercancel', stop)
      element.removeEventListener('lostpointercapture', stop)
      element.removeEventListener('wheel', wheel)
      window.removeEventListener('blur', stop)
    }
  }, [enabled, camera, gl, invertX, invertY, controlledFov])

  useEffect(() => {
    const current = state.current
    if (!enabled || !focusRequest?.id || current.focusId === focusRequest.id) return
    current.focusId = focusRequest.id
    // Hotspot yaw is clockwise from forward; camera yaw is anticlockwise.
    current.targetYaw = nearestAngle(current.yaw, -THREE.MathUtils.degToRad(Number(focusRequest.yaw) || 0))
    current.targetPitch = clamp(THREE.MathUtils.degToRad(Number(focusRequest.pitch) || 0), -PITCH_LIMIT, PITCH_LIMIT)
    if (focusRequest.fov) current.fov = clamp(focusRequest.fov, 35, 95)
  }, [enabled, focusRequest])

  useFrame((_, delta) => {
    if (!enabled) return
    const current = state.current
    const speed = current.pointerId == null ? 12 : 22
    current.yaw = damp(current.yaw, current.targetYaw, delta, speed)
    current.pitch = damp(current.pitch, current.targetPitch, delta, speed)
    camera.rotation.set(current.pitch, current.yaw, 0, 'YXZ')
    const fov = controlledFov ?? damp(camera.fov, current.fov, delta)
    if (viewRef) viewRef.current = { yaw: THREE.MathUtils.radToDeg(-current.yaw), pitch: THREE.MathUtils.radToDeg(current.pitch), fov }
    if (fov !== camera.fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })
  return null
}
