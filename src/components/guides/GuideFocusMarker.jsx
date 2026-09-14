import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

function positionFromAngles(yaw = 0, pitch = 0, radius = 7.5) {
  const y = THREE.MathUtils.degToRad(yaw)
  const p = THREE.MathUtils.degToRad(pitch)
  return [
    radius * Math.cos(p) * Math.sin(y),
    radius * Math.sin(p),
    -radius * Math.cos(p) * Math.cos(y),
  ]
}

export default function GuideFocusMarker({ focus }) {
  const group = useRef()
  const position = useMemo(
    () => positionFromAngles(focus?.yaw || 0, focus?.pitch || 0),
    [focus?.yaw, focus?.pitch],
  )

  useFrame(({ clock }) => {
    if (!group.current) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.12
    group.current.scale.setScalar(pulse)
    group.current.lookAt(0, 0, 0)
  })

  if (!focus) return null

  return (
    <group ref={group} position={position} renderOrder={30}>
      <mesh>
        <ringGeometry args={[0.24, 0.31, 48]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.92}
          side={THREE.DoubleSide}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.005]}>
        <circleGeometry args={[0.055, 32]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
