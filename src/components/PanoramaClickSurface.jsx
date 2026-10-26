import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function PanoramaClickSurface({ enabled, onPick }) {
  const gesture = useRef(null)
  useEffect(() => { gesture.current = null }, [enabled])
  if (!enabled) return null
  return (
    <mesh
      onPointerDown={(event) => {
        if (event.button !== 0 || gesture.current) return
        event.stopPropagation()
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
      }}
      onPointerMove={(event) => {
        const start = gesture.current
        if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) start.moved = true
      }}
      onPointerCancel={() => { gesture.current = null }}
      onPointerUp={(event) => {
        const start = gesture.current
        gesture.current = null
        if (!start || start.id !== event.pointerId || start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return
        event.stopPropagation()
        const direction = event.point.clone().normalize()
        onPick?.({
          yaw: THREE.MathUtils.radToDeg(Math.atan2(direction.x, -direction.z)),
          pitch: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1))),
        })
      }}
    >
      <sphereGeometry args={[49, 48, 32]} />
      <meshBasicMaterial side={THREE.BackSide} transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
