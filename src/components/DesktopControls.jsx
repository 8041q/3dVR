import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

// Dragging is intentionally inverted on both axes: moving the pointer right/down
// rotates the view right/down instead of dragging the panorama under the pointer.
export default function DesktopControls({ enabled = true, invertX = true, invertY = true }) {
  const { camera, gl } = useThree()
  const state = useRef({ yaw: 0, pitch: 0, dragging: false, x: 0, y: 0 })

  useEffect(() => {
    if (!enabled) return undefined

    const element = gl.domElement

    const onPointerDown = (event) => {
      state.current.dragging = true
      state.current.x = event.clientX
      state.current.y = event.clientY
      element.setPointerCapture?.(event.pointerId)
    }

    const onPointerMove = (event) => {
      if (!state.current.dragging) return

      const dx = event.clientX - state.current.x
      const dy = event.clientY - state.current.y
      state.current.x = event.clientX
      state.current.y = event.clientY

      const horizontalSign = invertX ? 1 : -1
      const verticalSign = invertY ? 1 : -1

      state.current.yaw += dx * 0.0035 * horizontalSign
      state.current.pitch = THREE.MathUtils.clamp(
        state.current.pitch + dy * 0.0035 * verticalSign,
        -Math.PI / 2 + 0.03,
        Math.PI / 2 - 0.03,
      )
    }

    const onPointerUp = () => {
      state.current.dragging = false
    }

    const onWheel = (event) => {
      camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * 0.02, 35, 95)
      camera.updateProjectionMatrix()
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    element.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('wheel', onWheel)
    }
  }, [enabled, gl, camera, invertX, invertY])

  useFrame(() => {
    if (!enabled) return
    camera.rotation.set(state.current.pitch, state.current.yaw, 0, 'YXZ')
  })

  return null
}
