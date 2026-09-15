import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useInteraction } from '../contexts/InteractionContext'
import { INTERACTION_LAYER } from '../input/interactionLayers'

function targetFrom(object) {
  let current = object
  while (current) {
    if (current.userData?.interactionTarget) return current
    current = current.parent
  }
  return null
}

export default function XRControllerInput({ enabled = true }) {
  const { gl, scene } = useThree()
  const interaction = useInteraction()
  const raycaster = useMemo(() => {
    const value = new THREE.Raycaster()
    value.layers.set(INTERACTION_LAYER)
    return value
  }, [])

  useEffect(() => {
    if (!enabled) return undefined

    const controllers = [gl.xr.getController(0), gl.xr.getController(1)]
    const temp = new THREE.Matrix4()
    const cleanup = []

    for (const controller of controllers) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -4),
      ])
      const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 })
      const line = new THREE.Line(geometry, material)
      line.name = '3dvr-controller-ray'
      controller.add(line)
      scene.add(controller)

      const select = () => {
        temp.identity().extractRotation(controller.matrixWorld)
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld)
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(temp)
        const hit = raycaster.intersectObjects(scene.children, true).find((entry) => targetFrom(entry.object))
        if (hit) interaction.activateObject(targetFrom(hit.object), 'xr-controller')
      }

      controller.addEventListener('select', select)
      cleanup.push(() => {
        controller.removeEventListener('select', select)
        controller.remove(line)
        scene.remove(controller)
        geometry.dispose()
        material.dispose()
      })
    }

    return () => cleanup.forEach((fn) => fn())
  }, [enabled, gl, interaction, raycaster, scene])

  return null
}
