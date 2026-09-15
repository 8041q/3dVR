import React, { useMemo } from 'react'
import * as THREE from 'three'
import SpatialScene from './SpatialScene'
import Hotspot from './Hotspot'

function boundsInfo(bounds) {
  const min = bounds?.min
  const max = bounds?.max
  if (!Array.isArray(min) || !Array.isArray(max) || min.length < 3 || max.length < 3) {
    return { center: new THREE.Vector3(), size: 6 }
  }
  const a = new THREE.Vector3(...min)
  const b = new THREE.Vector3(...max)
  return {
    center: a.clone().add(b).multiplyScalar(0.5),
    size: Math.max(0.5, b.x - a.x, b.y - a.y, b.z - a.z),
  }
}

export default function PhoneDollhouseScene({
  scene,
  scaleMultiplier = 1,
  spatialSceneRef,
  onSpatialStatus,
  onHotspotActivate,
  selectedHotspotId,
  guideHighlightHotspotId,
  onSelectHotspot,
}) {
  const info = useMemo(() => boundsInfo(scene?.spatial?.bounds), [scene?.spatial?.bounds])
  const scale = (2.4 / info.size) * Number(scaleMultiplier || 1)
  const distance = 3.2

  return (
    <group position={[0, -0.35, -distance]} scale={scale}>
      <group position={[-info.center.x, -info.center.y, -info.center.z]}>
        <SpatialScene ref={spatialSceneRef} scene={scene} onStatusChange={onSpatialStatus}>
          {(scene?.hotspots || []).filter((hotspot) => Array.isArray(hotspot.spatialPosition)).map((hotspot) => (
            <Hotspot
              key={hotspot.id}
              hotspot={hotspot}
              spatial
              pointerEnabled={false}
              selected={hotspot.id === selectedHotspotId}
              guideHighlight={hotspot.id === guideHighlightHotspotId}
              editMode={false}
              onSelect={onSelectHotspot}
              onActivate={onHotspotActivate}
            />
          ))}
        </SpatialScene>
      </group>
    </group>
  )
}
