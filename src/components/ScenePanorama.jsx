import React, { useEffect, useState } from 'react'
import * as THREE from 'three'
import MultiResPanorama from './MultiResPanorama'

function Legacy({image,opacity=1,radius=50}) { const [texture,setTexture]=useState(null); useEffect(()=>{if(!image){setTexture(null);return}let active=true;const loader=new THREE.TextureLoader();loader.load(image,(t)=>{if(!active){t.dispose();return}t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.repeat.x=-1;t.offset.x=1;t.needsUpdate=true;setTexture(t)},undefined,(e)=>console.warn(e));return()=>{active=false;setTexture((t)=>{t?.dispose();return null})}},[image]); if(!texture)return null; return <mesh><sphereGeometry args={[radius,64,40]}/><meshBasicMaterial map={texture} side={THREE.BackSide} transparent={opacity<1} opacity={opacity} depthWrite={false} toneMapped={false}/></mesh> }
export default function ScenePanorama({scene,opacity=1,radius=50}) { return scene?.panorama?.manifestUrl ? <MultiResPanorama manifestUrl={scene.panorama.manifestUrl} opacity={opacity} radius={radius}/> : <Legacy image={scene?.image} opacity={opacity} radius={radius}/> }
