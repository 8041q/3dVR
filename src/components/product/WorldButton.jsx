import React, { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useInteraction } from '../../contexts/InteractionContext'
import { INTERACTION_LAYER } from '../../input/interactionLayers'

function makeLabelTexture(label, selected, disabled, tone) {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 180
  const context = canvas.getContext('2d')

  const palette = tone === 'danger'
    ? {
        fill: selected ? 'rgba(111, 31, 39, 0.96)' : 'rgba(54, 16, 22, 0.90)',
        stroke: selected ? 'rgba(255, 196, 199, 0.90)' : 'rgba(255, 188, 193, 0.38)',
      }
    : {
        fill: selected ? 'rgba(46, 69, 96, 0.97)' : 'rgba(10, 14, 21, 0.88)',
        stroke: selected ? 'rgba(215, 233, 255, 0.92)' : 'rgba(255, 255, 255, 0.35)',
      }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.globalAlpha = disabled ? 0.42 : 1
  context.fillStyle = palette.fill
  context.strokeStyle = palette.stroke
  context.lineWidth = selected ? 7 : 4
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

export default function WorldButton({
  label,
  position,
  width = 1.35,
  onActivate,
  selected = false,
  disabled = false,
  tone = 'normal',
}) {
  const interaction = useInteraction()
  const meshRef = useRef(null)
  const texture = useMemo(
    () => makeLabelTexture(label, selected, disabled, tone),
    [disabled, label, selected, tone],
  )

  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => { meshRef.current?.layers.enable(INTERACTION_LAYER) }, [])

  return (
    <mesh
      ref={meshRef}
      position={position}
      userData={disabled ? {} : {
        interactionTarget: true,
        interactionId: `product:${label}`,
        activate: () => onActivate?.(),
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        if (!disabled) interaction.activateObject(event.object, 'pointer')
      }}
      renderOrder={60}
    >
      <planeGeometry args={[width, width / 4.25]} />
      <meshBasicMaterial
        map={texture}
        transparent
        side={THREE.DoubleSide}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
