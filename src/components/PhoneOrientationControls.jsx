import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { createPhoneOrientation } from '../input/phoneOrientation'
export { requestPhoneMotionPermission } from '../input/phoneOrientation'

const PhoneOrientationControls = forwardRef(function PhoneOrientationControls({
  enabled, permissionState = 'unknown', onStatusChange, touchEnabled = false, fov = 75,
}, ref) {
  const { camera, gl } = useThree()
  const onStatus = useRef(onStatusChange)
  onStatus.current = onStatusChange
  const tracker = useMemo(() => createPhoneOrientation({ camera, onStatus: (status) => onStatus.current?.(status) }), [camera])
  useImperativeHandle(ref, () => ({ recenter: tracker.recenter, getStatus: tracker.getStatus }), [tracker])
  useEffect(() => {
    if (!enabled) { tracker.stop(); return undefined }
    return tracker.start(permissionState)
  }, [enabled, permissionState, tracker])

  useEffect(() => {
    if (!enabled || !touchEnabled) return undefined
    const element = gl.domElement
    const previousTouchAction = element.style.touchAction
    element.style.touchAction = 'none'
    let pointer = null
    const down = (event) => {
      if (event.pointerType !== 'touch') return
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
      element.setPointerCapture?.(event.pointerId)
    }
    const move = (event) => {
      if (pointer?.id !== event.pointerId) return
      tracker.addTouch(event.clientX - pointer.x, event.clientY - pointer.y)
      pointer.x = event.clientX; pointer.y = event.clientY
    }
    const up = (event) => {
      if (pointer?.id !== event.pointerId) return
      if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId)
      pointer = null
    }
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
    return () => {
      if (pointer && element.hasPointerCapture?.(pointer.id)) element.releasePointerCapture(pointer.id)
      element.style.touchAction = previousTouchAction
      element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up)
    }
  }, [enabled, gl, touchEnabled, tracker])

  useEffect(() => {
    if (!enabled || fov == null) return
    const next = THREE.MathUtils.clamp(Number(fov) || 75, 35, 120)
    if (Math.abs(camera.fov - next) > 0.01) { camera.fov = next; camera.updateProjectionMatrix() }
  }, [camera, enabled, fov])
  useFrame(() => { if (enabled) tracker.update() })
  return null
})
export default PhoneOrientationControls
