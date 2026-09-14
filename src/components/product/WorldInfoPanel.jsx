import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import WorldButton from './WorldButton'

function wrapText(context, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }

  if (line) lines.push(line)
  return lines
}

function createInfoTexture(title, body) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 760
  const context = canvas.getContext('2d')

  context.fillStyle = 'rgba(8, 12, 19, 0.96)'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = 'rgba(255,255,255,0.35)'
  context.lineWidth = 5
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8)

  context.fillStyle = '#ffffff'
  context.font = '700 64px system-ui, sans-serif'
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillText(title || 'Information', 70, 62, 1060)

  context.fillStyle = '#dce3ec'
  context.font = '400 40px system-ui, sans-serif'
  const lines = wrapText(context, body || '', 1060).slice(0, 11)
  lines.forEach((line, index) => {
    context.fillText(line, 70, 170 + index * 50)
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

export default function WorldInfoPanel({ info, onClose }) {
  const { camera } = useThree()
  const texture = useMemo(() => createInfoTexture(info?.title, info?.body), [info?.title, info?.body])

  const transform = useMemo(() => {
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    direction.y = 0
    if (direction.lengthSq() < 0.001) direction.set(0, 0, -1)
    direction.normalize()

    const position = camera.position.clone()
      .addScaledVector(direction, 1.95)
      .add(new THREE.Vector3(0, 0.05, 0))
    const yaw = Math.atan2(direction.x, direction.z)

    return {
      position: position.toArray(),
      rotation: [0, yaw + Math.PI, 0],
    }
  }, [camera, info?.title, info?.body])

  useEffect(() => () => texture.dispose(), [texture])

  if (!info) return null

  return (
    <group position={transform.position} rotation={transform.rotation} renderOrder={50}>
      <mesh renderOrder={50}>
        <planeGeometry args={[1.8, 1.14]} />
        <meshBasicMaterial
          map={texture}
          transparent
          side={THREE.DoubleSide}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <WorldButton label="Close" position={[0, -0.78, 0.01]} width={0.86} onActivate={onClose} />
    </group>
  )
}
