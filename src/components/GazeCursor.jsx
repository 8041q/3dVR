import React, { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const RETICLE_DISTANCE = 18
const RETICLE_IDLE_COLOR = new THREE.Color(0xf7fbff)
const RETICLE_HOVER_COLOR = new THREE.Color(0x66ccff)
const RETICLE_ACTIVE_COLOR = new THREE.Color(0x7cffb2)

function resetObjectState(object) {
  if (!object) return

  if (object.userData?.originalScale) {
    object.scale.copy(object.userData.originalScale)
  }

  object.userData?.setGazeHovered?.(false)
}

function applyObjectState(object, progress) {
  if (!object) return

  if (!object.userData?.originalScale) {
    object.userData.originalScale = object.scale.clone()
  }

  object.scale.copy(object.userData.originalScale).multiplyScalar(1 + progress * 0.35)
  object.userData?.setGazeHovered?.(true)
}

export default function GazeCursor({ dwell = 1.2 }) {
  const raycaster = useRef(new THREE.Raycaster())
  const currentTarget = useRef({ object: null, progress: 0, activated: false })
  const reticleGroupRef = useRef()
  const dotRef = useRef()
  const reticleMaterial = useRef(new THREE.MeshBasicMaterial({
    color: RETICLE_IDLE_COLOR.clone(),
    transparent: true,
    opacity: 0.82,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  }))
  const dotMaterial = useRef(new THREE.MeshBasicMaterial({
    color: RETICLE_IDLE_COLOR.clone(),
    transparent: true,
    opacity: 0.75,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  }))
  const cameraPosition = useRef(new THREE.Vector3())
  const cameraDirection = useRef(new THREE.Vector3())
  const cameraQuaternion = useRef(new THREE.Quaternion())
  const { camera, scene } = useThree()

  useEffect(() => {
    return () => {
      resetObjectState(currentTarget.current.object)
      reticleMaterial.current.dispose()
      dotMaterial.current.dispose()
    }
  }, [])

  useFrame((_, delta) => {
    if (!camera || !scene || !reticleGroupRef.current || !dotRef.current) return

    camera.getWorldPosition(cameraPosition.current)
    camera.getWorldQuaternion(cameraQuaternion.current)
    camera.getWorldDirection(cameraDirection.current)

    reticleGroupRef.current.position
      .copy(cameraPosition.current)
      .add(cameraDirection.current.multiplyScalar(RETICLE_DISTANCE))
    reticleGroupRef.current.quaternion.copy(cameraQuaternion.current)

    raycaster.current.set(cameraPosition.current, cameraDirection.current.normalize())

    const intersects = raycaster.current.intersectObjects(scene.children, true)
    const found = intersects.find((intersection) => intersection.object?.userData?.isGazeTarget)?.object || null
    const gazeState = currentTarget.current

    if (found) {
      if (gazeState.object !== found) {
        resetObjectState(gazeState.object)
        gazeState.object = found
        gazeState.progress = 0
        gazeState.activated = false
      }

      if (!gazeState.activated) {
        gazeState.progress = Math.min(1, gazeState.progress + (delta / Math.max(0.001, dwell)))
        if (gazeState.progress >= 1) {
          gazeState.progress = 1
          gazeState.activated = true
          found.userData?.activate?.()
        }
      }

      applyObjectState(found, gazeState.progress)
    } else {
      if (gazeState.object) {
        resetObjectState(gazeState.object)
        gazeState.object = null
      }

      gazeState.progress = 0
      gazeState.activated = false
    }

    const isHoveringTarget = Boolean(gazeState.object)
    const reticleColor = gazeState.activated
      ? RETICLE_ACTIVE_COLOR
      : isHoveringTarget
        ? RETICLE_HOVER_COLOR
        : RETICLE_IDLE_COLOR

    reticleMaterial.current.color.copy(reticleColor)
    reticleMaterial.current.opacity = isHoveringTarget ? 0.98 : 0.82
    dotMaterial.current.color.copy(reticleColor)
    dotMaterial.current.opacity = isHoveringTarget ? 0.95 : 0.75
    reticleGroupRef.current.scale.setScalar(isHoveringTarget ? 1.08 : 1)
    dotRef.current.scale.setScalar(0.55 + gazeState.progress * 1.55)
  })

  return (
    <group ref={reticleGroupRef}>
      <mesh material={reticleMaterial.current} renderOrder={1000}>
        <ringGeometry args={[0.18, 0.215, 48]} />
      </mesh>
      <mesh position={[0.31, 0, 0]} material={reticleMaterial.current} renderOrder={1000}>
        <boxGeometry args={[0.13, 0.02, 0.001]} />
      </mesh>
      <mesh position={[-0.31, 0, 0]} material={reticleMaterial.current} renderOrder={1000}>
        <boxGeometry args={[0.13, 0.02, 0.001]} />
      </mesh>
      <mesh position={[0, 0.31, 0]} material={reticleMaterial.current} renderOrder={1000}>
        <boxGeometry args={[0.02, 0.13, 0.001]} />
      </mesh>
      <mesh position={[0, -0.31, 0]} material={reticleMaterial.current} renderOrder={1000}>
        <boxGeometry args={[0.02, 0.13, 0.001]} />
      </mesh>
      <mesh ref={dotRef} position={[0, 0, 0.001]} material={dotMaterial.current} renderOrder={1000}>
        <circleGeometry args={[0.04, 24]} />
      </mesh>
    </group>
  )
}
