import React from 'react'
import * as THREE from 'three'
export default function PanoramaClickSurface({enabled,onPick}) { if(!enabled)return null; return <mesh onPointerDown={(e)=>{e.stopPropagation();const d=e.point.clone().normalize();const yaw=THREE.MathUtils.radToDeg(Math.atan2(d.x,-d.z));const pitch=THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y,-1,1)));onPick?.({yaw,pitch})}}><sphereGeometry args={[49,48,32]}/><meshBasicMaterial side={THREE.BackSide} transparent opacity={0} depthWrite={false}/></mesh> }
