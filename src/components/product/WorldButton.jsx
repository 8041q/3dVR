import React, { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useInteraction } from '../../contexts/InteractionContext'
import { INTERACTION_LAYER } from '../../input/interactionLayers'
import { drawWorldSurface, worldAppearance } from '../../theme/worldAppearance'

function makeLabelTexture(label, selected, disabled, tone, marker) {
  const canvas = document.createElement('canvas')
  canvas.width = marker ? 256 : 768
  canvas.height = marker ? 256 : 180
  const context = canvas.getContext('2d')
  const colors = worldAppearance()
  const danger = tone === 'danger'
  drawWorldSurface(context, {
    fill: selected ? colors.accent : danger ? colors['danger-surface'] : colors.surface,
    stroke: selected ? colors.accent : colors.line,
    radius: marker ? 128 : 32,
    border: 3,
  })

  let fontSize = marker ? 120 : 58
  context.font = `500 ${fontSize}px ${colors.font}`
  while (context.measureText(label).width > canvas.width - 80 && fontSize > 28) {
    fontSize -= 2
    context.font = `500 ${fontSize}px ${colors.font}`
  }

  context.fillStyle = disabled ? colors.muted : selected ? colors['on-accent'] : danger ? colors.danger : colors.ink
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
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
  marker = false,
}) {
  const interaction = useInteraction()
  const meshRef = useRef(null)
  const texture = useMemo(
    () => makeLabelTexture(label, selected, disabled, tone, marker),
    [disabled, label, selected, tone, marker],
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
      <planeGeometry args={[width, marker ? width : width / 4.25]} />
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
