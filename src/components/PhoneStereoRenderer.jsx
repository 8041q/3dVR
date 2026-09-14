import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

export default function PhoneStereoRenderer({ enabled }) {
  const { gl, scene, camera } = useThree()
  const stereo = useMemo(() => {
    const value = new THREE.StereoCamera()
    value.eyeSep = 0.064
    return value
  }, [])
  const bufferSize = useMemo(() => new THREE.Vector2(), [])

  useFrame(() => {
    if (!enabled) return
    stereo.update(camera)
    gl.getDrawingBufferSize(bufferSize)
    const width = Math.floor(bufferSize.x / 2)
    const height = Math.floor(bufferSize.y)

    gl.setScissorTest(true)
    gl.setViewport(0, 0, width, height)
    gl.setScissor(0, 0, width, height)
    gl.render(scene, stereo.cameraL)

    gl.setViewport(width, 0, bufferSize.x - width, height)
    gl.setScissor(width, 0, bufferSize.x - width, height)
    gl.render(scene, stereo.cameraR)

    gl.setScissorTest(false)
    gl.setViewport(0, 0, bufferSize.x, height)
  }, enabled ? 1 : 0)

  return null
}
