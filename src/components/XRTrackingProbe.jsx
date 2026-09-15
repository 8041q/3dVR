import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * Classifies the active immersive session as positional (6DoF) or emulated
 * position (rotation-only / 3DoF). WebXR exposes this on the viewer pose.
 *
 * If a browser never produces a viewer pose, fail closed to panorama after a
 * short timeout instead of leaving an exhibition visitor on a blank scene.
 */
export default function XRTrackingProbe({ enabled, onTrackingChange, timeoutMs = 1800 }) {
  const { gl } = useThree()
  const last = useRef('inactive')
  const sawPose = useRef(false)

  useEffect(() => {
    sawPose.current = false

    if (!enabled) {
      if (last.current !== 'inactive') {
        last.current = 'inactive'
        onTrackingChange?.('inactive')
      }
      return undefined
    }

    const timeout = window.setTimeout(() => {
      if (sawPose.current || last.current !== 'unknown') return
      last.current = 'rotation-only'
      onTrackingChange?.('rotation-only')
    }, timeoutMs)

    return () => window.clearTimeout(timeout)
  }, [enabled, onTrackingChange, timeoutMs])

  useFrame((_state, _delta, frame) => {
    if (!enabled || !frame || !gl.xr.isPresenting) return
    const referenceSpace = gl.xr.getReferenceSpace?.()
    if (!referenceSpace) return

    const pose = frame.getViewerPose(referenceSpace)
    if (!pose) return

    sawPose.current = true
    const next = pose.emulatedPosition ? 'rotation-only' : 'tracked'
    if (next !== last.current) {
      last.current = next
      onTrackingChange?.(next)
    }
  })

  useEffect(() => {
    if (enabled && last.current !== 'unknown') {
      last.current = 'unknown'
      onTrackingChange?.('unknown')
    }
  }, [enabled, onTrackingChange])

  return null
}
