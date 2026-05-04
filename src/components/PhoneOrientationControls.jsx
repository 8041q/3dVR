import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const zAxis = new THREE.Vector3(0, 0, 1)
const deviceEuler = new THREE.Euler()
const screenAdjustment = new THREE.Quaternion()
const cameraAdjustment = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)

function getScreenAngle() {
  if (typeof window === 'undefined') return 0
  if (window.screen?.orientation && typeof window.screen.orientation.angle === 'number') {
    return THREE.MathUtils.degToRad(window.screen.orientation.angle)
  }
  if (typeof window.orientation === 'number') {
    return THREE.MathUtils.degToRad(window.orientation)
  }
  return 0
}

function buildDeviceQuaternion(alpha, beta, gamma) {
  const deviceQuaternion = new THREE.Quaternion()
  deviceEuler.set(
    THREE.MathUtils.degToRad(beta),
    THREE.MathUtils.degToRad(alpha),
    -THREE.MathUtils.degToRad(gamma),
    'YXZ'
  )
  deviceQuaternion.setFromEuler(deviceEuler)
  deviceQuaternion.multiply(cameraAdjustment)
  screenAdjustment.setFromAxisAngle(zAxis, -getScreenAngle())
  deviceQuaternion.multiply(screenAdjustment)
  return deviceQuaternion
}

export default function PhoneOrientationControls({ active, recenterToken = 0, onStateChange }) {
  const { camera } = useThree()
  const targetQuaternion = useRef(camera.quaternion.clone())
  const alignmentQuaternion = useRef(new THREE.Quaternion())
  const latestRawQuaternion = useRef(null)
  const hasAligned = useRef(false)

  useEffect(() => {
    if (!active) {
      hasAligned.current = false
      latestRawQuaternion.current = null
      onStateChange('idle')
      return undefined
    }

    onStateChange('listening')
    const timeoutId = window.setTimeout(() => {
      onStateChange('no-data')
    }, 2000)

    const handleOrientation = (event) => {
      const { alpha, beta, gamma } = event
      if (alpha === null && beta === null && gamma === null) {
        onStateChange('no-data')
        return
      }

      const rawQuaternion = buildDeviceQuaternion(alpha ?? 0, beta ?? 0, gamma ?? 0)
      latestRawQuaternion.current = rawQuaternion

      if (!hasAligned.current) {
        alignmentQuaternion.current.copy(rawQuaternion).invert()
        hasAligned.current = true
      }

      targetQuaternion.current.copy(alignmentQuaternion.current).multiply(rawQuaternion)
      window.clearTimeout(timeoutId)
      onStateChange('active')
    }

    window.addEventListener('deviceorientation', handleOrientation, true)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('deviceorientation', handleOrientation, true)
    }
  }, [active, onStateChange])

  useEffect(() => {
    if (!active || !latestRawQuaternion.current) return
    alignmentQuaternion.current.copy(latestRawQuaternion.current).invert()
    targetQuaternion.current.identity()
  }, [active, recenterToken])

  useFrame((_, delta) => {
    if (!active) return
    camera.quaternion.slerp(targetQuaternion.current, Math.min(1, delta * 6))
  })

  return null
}