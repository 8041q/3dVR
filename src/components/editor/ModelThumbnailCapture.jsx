import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export default function ThumbnailCapture({ ready, onCapture }) {
  const captured = useRef(false)
  const frames = useRef(0)
  useFrame(({ gl, scene, camera }) => {
    if (!ready || captured.current || ++frames.current < 8) return
    captured.current = true
    try {
      // Capture an already loaded preview, never fetch a model for each grid card.
      const canvas = document.createElement('canvas')
      canvas.width = 480
      canvas.height = 320
      const context = canvas.getContext('2d')
      context.fillStyle = getComputedStyle(gl.domElement).getPropertyValue('--ui-stage').trim() || '#202630'
      context.fillRect(0, 0, 480, 320)
      const source = gl.domElement
      gl.render(scene, camera)
      const scale = Math.min(480 / source.width, 320 / source.height)
      const width = source.width * scale, height = source.height * scale
      context.drawImage(source, (480 - width) / 2, (320 - height) / 2, width, height)
      canvas.toBlob(onCapture, 'image/webp', 0.8)
    } catch { onCapture(null) }
  })
  return null
}

