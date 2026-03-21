import React from 'react'
import { Html } from '@react-three/drei'

export default function Hotspot({ position, label, onClick }) {
  return (
    <Html position={position} center occlude>
      <div className="hotspot" onClick={(e) => { e.stopPropagation(); onClick && onClick() }} role="button" tabIndex={0}>
        {label}
      </div>
    </Html>
  )
}
