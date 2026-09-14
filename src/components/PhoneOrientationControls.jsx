import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

const zee=new THREE.Vector3(0,0,1); const euler=new THREE.Euler(); const q0=new THREE.Quaternion(); const q1=new THREE.Quaternion(-Math.sqrt(.5),0,0,Math.sqrt(.5));
function orient(q,alpha,beta,gamma,orient){euler.set(beta,alpha,-gamma,'YXZ');q.setFromEuler(euler);q.multiply(q1);q.multiply(q0.setFromAxisAngle(zee,-orient))}
export default function PhoneOrientationControls({enabled,onActiveChange}) { const {camera}=useThree(); const state=useRef({alpha:null,beta:null,gamma:null,screen:0}); useEffect(()=>{if(!enabled)return;const device=(e)=>{state.current.alpha=e.alpha;state.current.beta=e.beta;state.current.gamma=e.gamma;onActiveChange?.(e.alpha!=null)};const updateScreen=()=>{state.current.screen=THREE.MathUtils.degToRad(window.screen?.orientation?.angle || window.orientation || 0)};updateScreen();window.addEventListener('deviceorientation',device,true);window.addEventListener('orientationchange',updateScreen);return()=>{window.removeEventListener('deviceorientation',device,true);window.removeEventListener('orientationchange',updateScreen)}},[enabled,onActiveChange]); useFrame(()=>{if(!enabled||state.current.alpha==null)return;orient(camera.quaternion,THREE.MathUtils.degToRad(state.current.alpha||0),THREE.MathUtils.degToRad(state.current.beta||0),THREE.MathUtils.degToRad(state.current.gamma||0),state.current.screen)}); return null }

export async function requestPhoneMotionPermission() { const api=window.DeviceOrientationEvent; if (typeof api?.requestPermission==='function') return (await api.requestPermission())==='granted'; return 'DeviceOrientationEvent' in window }
