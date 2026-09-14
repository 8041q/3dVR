import React, { useMemo } from 'react'
import * as THREE from 'three'
import { useInteraction } from '../contexts/InteractionContext'

function positionFromAngles(yaw=0,pitch=0,radius=8) { const y=THREE.MathUtils.degToRad(yaw);const p=THREE.MathUtils.degToRad(pitch);return [radius*Math.cos(p)*Math.sin(y),radius*Math.sin(p),-radius*Math.cos(p)*Math.cos(y)] }
export default function Hotspot({hotspot,onActivate,selected=false,editMode=false,onSelect}) { const interaction=useInteraction(); const pos=useMemo(()=>positionFromAngles(hotspot.position?.yaw||0,hotspot.position?.pitch||0,8),[hotspot.position?.yaw,hotspot.position?.pitch]); const activate=()=>onActivate?.(hotspot); return <mesh position={pos} scale={hotspot.size||1} userData={{interactionTarget:true,interactionId:hotspot.id,activate}} onClick={(e)=>{e.stopPropagation(); if(editMode)onSelect?.(hotspot.id);else interaction.activateObject(e.object,'pointer')}}><sphereGeometry args={[.18,24,16]}/><meshBasicMaterial color={selected?'#ffcc66':'#ffffff'} transparent opacity={.9} depthTest={false}/></mesh> }
