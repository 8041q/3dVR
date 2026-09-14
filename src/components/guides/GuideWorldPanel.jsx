import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import WorldButton from '../product/WorldButton'

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

function createGuideTexture(guide, step, stepIndex) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 720
  const context = canvas.getContext('2d')

  context.fillStyle = 'rgba(8, 12, 19, 0.95)'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = 'rgba(255,255,255,0.36)'
  context.lineWidth = 5
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8)

  context.fillStyle = '#9eabbc'
  context.font = '600 30px system-ui, sans-serif'
  context.fillText(`${guide.title || 'Guide'} · ${stepIndex + 1}/${guide.steps.length}`, 70, 60)

  context.fillStyle = '#ffffff'
  context.font = '700 58px system-ui, sans-serif'
  context.fillText(step.title || `Step ${stepIndex + 1}`, 70, 115, 1060)

  context.fillStyle = '#dce3ec'
  context.font = '400 38px system-ui, sans-serif'
  const lines = wrapText(context, step.instruction || '', 1060).slice(0, 8)
  lines.forEach((line, index) => context.fillText(line, 70, 225 + index * 48))

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

export default function GuideWorldPanel({ guide, step, stepIndex, onPrevious, onNext, onExit, onPlayNarration }) {
  const { camera } = useThree()
  const texture = useMemo(
    () => createGuideTexture(guide, step, stepIndex),
    [guide, step, stepIndex],
  )

  const transform = useMemo(() => {
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    direction.y = 0
    if (direction.lengthSq() < 0.001) direction.set(0, 0, -1)
    direction.normalize()

    const position = camera.position.clone()
      .addScaledVector(direction, 2.05)
      .add(new THREE.Vector3(0, 0.75, 0))
    const yaw = Math.atan2(direction.x, direction.z)

    return {
      position: position.toArray(),
      rotation: [0, yaw + Math.PI, 0],
    }
  }, [camera, step.id])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <group position={transform.position} rotation={transform.rotation} renderOrder={55}>
      <mesh renderOrder={55}>
        <planeGeometry args={[1.95, 1.17]} />
        <meshBasicMaterial
          map={texture}
          transparent
          side={THREE.DoubleSide}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>

      {step.narrationUrl && (
        <WorldButton
          label="Narration"
          position={[-0.83, -0.79, 0.01]}
          width={0.58}
          onActivate={onPlayNarration}
        />
      )}
      <WorldButton
        label="Previous"
        position={[step.narrationUrl ? -0.28 : -0.62, -0.79, 0.01]}
        width={0.58}
        onActivate={onPrevious}
      />
      <WorldButton
        label={stepIndex >= guide.steps.length - 1 ? 'Finish' : 'Next'}
        position={[step.narrationUrl ? 0.35 : 0.1, -0.79, 0.01]}
        width={0.58}
        onActivate={onNext}
      />
      <WorldButton
        label="Exit"
        position={[step.narrationUrl ? 0.88 : 0.77, -0.79, 0.01]}
        width={0.48}
        onActivate={onExit}
      />
    </group>
  )
}
