import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useInteraction } from '../contexts/InteractionContext'

function positionFromAngles(yaw = 0, pitch = 0, radius = 8) {
  const y = THREE.MathUtils.degToRad(yaw)
  const p = THREE.MathUtils.degToRad(pitch)
  return [
    radius * Math.cos(p) * Math.sin(y),
    radius * Math.sin(p),
    -radius * Math.cos(p) * Math.cos(y),
  ]
}

export default function Hotspot({
  hotspot,
  onActivate,
  selected = false,
  guideHighlight = false,
  editMode = false,
  onSelect,
}) {
  const interaction = useInteraction()
  const mesh = useRef()
  const baseScale = hotspot.size || 1
  const pos = useMemo(
    () => positionFromAngles(hotspot.position?.yaw || 0, hotspot.position?.pitch || 0, 8),
    [hotspot.position?.yaw, hotspot.position?.pitch],
  )
  const activate = () => onActivate?.(hotspot)

  useFrame(({ clock }) => {
    if (!mesh.current) return
    const pulse = guideHighlight ? 1.2 + Math.sin(clock.elapsedTime * 5) * 0.18 : 1
    mesh.current.scale.setScalar(baseScale * pulse)
  })

  return (
    <mesh
      ref={mesh}
      position={pos}
      scale={baseScale}
      userData={{
        interactionTarget: true,
        interactionId: hotspot.id,
        activate,
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (editMode) onSelect?.(hotspot.id)
        else interaction.activateObject(event.object, 'pointer')
      }}
    >
      <sphereGeometry args={[0.18, 24, 16]} />
      <meshBasicMaterial
        color={guideHighlight ? '#7fd7ff' : selected ? '#ffcc66' : '#ffffff'}
        transparent
        opacity={guideHighlight ? 1 : 0.9}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  )
}
