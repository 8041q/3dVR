import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useInteraction } from '../../contexts/InteractionContext'

function makeLabelTexture(label) {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 180
  const context = canvas.getContext('2d')

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(10, 14, 21, 0.92)'
  context.strokeStyle = 'rgba(255, 255, 255, 0.42)'
  context.lineWidth = 4
  context.beginPath()
  context.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 28)
  context.fill()
  context.stroke()

  let fontSize = 58
  context.font = `600 ${fontSize}px system-ui, sans-serif`
  while (context.measureText(label).width > canvas.width - 80 && fontSize > 28) {
    fontSize -= 2
    context.font = `600 ${fontSize}px system-ui, sans-serif`
  }

  context.fillStyle = '#ffffff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

export default function WorldButton({ label, position, width = 1.35, onActivate }) {
  const interaction = useInteraction()
  const texture = useMemo(() => makeLabelTexture(label), [label])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh
      position={position}
      userData={{
        interactionTarget: true,
        interactionId: `product:${label}`,
        activate: () => onActivate?.(),
      }}
      onClick={(event) => {
        event.stopPropagation()
        interaction.activateObject(event.object, 'pointer')
      }}
      renderOrder={40}
    >
      <planeGeometry args={[width, width / 4.25]} />
      <meshBasicMaterial
        map={texture}
        transparent
        side={THREE.DoubleSide}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  )
}
