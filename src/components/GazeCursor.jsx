import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useInteraction } from '../contexts/InteractionContext'
import { INTERACTION_LAYER } from '../input/interactionLayers'

function targetFromHit(object) {
  let current = object
  while (current) {
    if (current.userData?.interactionTarget) return current
    current = current.parent
  }
  return null
}

export default function GazeCursor({ enabled, dwellMs = 1200, alwaysVisible=false }) {
  const { camera, scene, gl } = useThree()
  const interaction = useInteraction()
  const ray = useMemo(() => {
    const value = new THREE.Raycaster()
    value.layers.set(INTERACTION_LAYER)
    return value
  }, [])
  const origin = useMemo(() => new THREE.Vector3(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const mesh = useRef()
  const progressRing = useRef()
  const progressGeometry = useRef()
  const current = useRef(null)
  const started = useRef(0)
  const fired = useRef(false)

  useFrame(({ clock }) => {
    if (!enabled) {
      if (current.current) {
        current.current = null
        interaction.setFocusedTarget(null)
      }
      if (mesh.current) mesh.current.visible = false
      return
    }

    const activeCamera = gl.xr.isPresenting ? gl.xr.getCamera(camera) : camera
    activeCamera.getWorldPosition(origin)
    activeCamera.getWorldDirection(dir)
    ray.set(origin, dir)

    const hit = ray.intersectObjects(scene.children, true).find((entry) => targetFromHit(entry.object))
    const target = hit ? targetFromHit(hit.object) : null

    if (target !== current.current) {
      current.current = target
      started.current = clock.elapsedTime * 1000
      fired.current = false
      interaction.setFocusedTarget(target)
    }

    const elapsed = clock.elapsedTime * 1000 - started.current
    const progress = target ? Math.min(1, elapsed / dwellMs) : 0
    if (target && progress >= 1 && !fired.current) {
      fired.current = true
      interaction.activateObject(target, 'gaze')
    }

    const distance = Math.min(hit?.distance || 3, 6)
    if (mesh.current) {
      mesh.current.visible = alwaysVisible || Boolean(target)
      mesh.current.position.copy(origin).addScaledVector(dir, distance)
      mesh.current.quaternion.copy(activeCamera.quaternion)
      mesh.current.scale.setScalar(0.02 * distance)
    }
    if (progressRing.current) progressRing.current.visible = Boolean(target)
    if (progressGeometry.current) {
      const maxCount = progressGeometry.current.index?.count || 0
      progressGeometry.current.setDrawRange(0, Math.floor(maxCount * progress))
    }
  })

  if (!enabled) return null
  return (
    <group ref={mesh} visible={alwaysVisible} renderOrder={1000}>
      <mesh>
        <ringGeometry args={[0.45, 0.6, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} depthTest={false} />
      </mesh>
      <mesh ref={progressRing} position={[0, 0, 0.001]} visible={false}>
        <ringGeometry ref={progressGeometry} args={[0.68, 0.82, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} depthTest={false} />
      </mesh>
    </group>
  )
}
