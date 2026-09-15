import React, { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useInteraction } from '../contexts/InteractionContext'
import { normalizeHotspotStyle } from '../hotspots/hotspotStyles'
import { INTERACTION_LAYER } from '../input/interactionLayers'

function positionFromAngles(yaw = 0, pitch = 0, radius = 8) {
  const y = THREE.MathUtils.degToRad(yaw)
  const p = THREE.MathUtils.degToRad(pitch)
  return new THREE.Vector3(
    radius * Math.cos(p) * Math.sin(y),
    radius * Math.sin(p),
    -radius * Math.cos(p) * Math.cos(y),
  )
}

function inwardQuaternion(position) {
  const normal = position.clone().normalize().negate()
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal,
  )
}

function doorwayShape() {
  const shape = new THREE.Shape()
  shape.moveTo(-0.22, -0.34)
  shape.lineTo(-0.22, 0.13)
  shape.quadraticCurveTo(-0.22, 0.34, 0, 0.34)
  shape.quadraticCurveTo(0.22, 0.34, 0.22, 0.13)
  shape.lineTo(0.22, -0.34)
  shape.lineTo(-0.22, -0.34)
  return shape
}

function windowShape() {
  const shape = new THREE.Shape()
  shape.moveTo(-0.34, -0.23)
  shape.lineTo(0.34, -0.23)
  shape.lineTo(0.34, 0.23)
  shape.lineTo(-0.34, 0.23)
  shape.lineTo(-0.34, -0.23)

  const hole = new THREE.Path()
  hole.moveTo(-0.25, -0.14)
  hole.lineTo(-0.02, -0.14)
  hole.lineTo(-0.02, 0.14)
  hole.lineTo(-0.25, 0.14)
  hole.lineTo(-0.25, -0.14)
  shape.holes.push(hole)

  const hole2 = new THREE.Path()
  hole2.moveTo(0.02, -0.14)
  hole2.lineTo(0.25, -0.14)
  hole2.lineTo(0.25, 0.14)
  hole2.lineTo(0.02, 0.14)
  hole2.lineTo(0.02, -0.14)
  shape.holes.push(hole2)
  return shape
}

function navigationShape() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.30)
  shape.lineTo(0.30, -0.02)
  shape.lineTo(0.13, -0.02)
  shape.lineTo(0.13, -0.30)
  shape.lineTo(-0.13, -0.30)
  shape.lineTo(-0.13, -0.02)
  shape.lineTo(-0.30, -0.02)
  shape.lineTo(0, 0.30)
  return shape
}

function HotspotMaterial({ color, opacity }) {
  return (
    <meshBasicMaterial
      color={color}
      transparent
      opacity={opacity}
      depthTest={false}
      depthWrite={false}
      toneMapped={false}
      side={THREE.DoubleSide}
    />
  )
}

function HotspotGeometry({ preset, color, opacity }) {

  if (preset === 'floor') {
    return (
      <mesh scale={[1.45, 0.62, 1]}>
        <ringGeometry args={[0.18, 0.29, 42]} />
        <HotspotMaterial color={color} opacity={opacity} />
      </mesh>
    )
  }

  if (preset === 'doorway') {
    return (
      <mesh>
        <shapeGeometry args={[doorwayShape()]} />
        <HotspotMaterial color={color} opacity={opacity} />
      </mesh>
    )
  }

  if (preset === 'window') {
    return (
      <mesh>
        <shapeGeometry args={[windowShape()]} />
        <HotspotMaterial color={color} opacity={opacity} />
      </mesh>
    )
  }

  if (preset === 'product') {
    return (
      <mesh rotation={[0, 0, Math.PI / 4]} scale={[1.08, 1.08, 1]}>
        <circleGeometry args={[0.27, 4]} />
        <HotspotMaterial color={color} opacity={opacity} />
      </mesh>
    )
  }

  if (preset === 'info') {
    return (
      <group>
        <mesh>
          <ringGeometry args={[0.18, 0.27, 36]} />
          <HotspotMaterial color={color} opacity={opacity} />
        </mesh>
        <mesh position={[0, 0, 0.002]}>
          <circleGeometry args={[0.055, 24]} />
          <HotspotMaterial color={color} opacity={opacity} />
        </mesh>
      </group>
    )
  }

  return (
    <mesh>
      <shapeGeometry args={[navigationShape()]} />
      <HotspotMaterial color={color} opacity={opacity} />
    </mesh>
  )
}

const HALO_SCALE = {
  navigation: [1.15, 1.15, 1],
  floor: [1.55, 0.78, 1],
  doorway: [1.02, 1.40, 1],
  window: [1.42, 1.02, 1],
  product: [1.10, 1.10, 1],
  info: [1.0, 1.0, 1],
}

export default function Hotspot({
  hotspot,
  onActivate,
  selected = false,
  guideHighlight = false,
  editMode = false,
  onSelect,
  spatial = false,
  pointerEnabled = true,
}) {
  const interaction = useInteraction()
  const { camera, gl } = useThree()
  const root = useRef()
  const halo = useRef()
  const haloMaterial = useRef()
  const baseScale = hotspot.size || 1
  const style = normalizeHotspotStyle(hotspot)

  const position = useMemo(
    () => spatial && Array.isArray(hotspot.spatialPosition)
      ? new THREE.Vector3(...hotspot.spatialPosition)
      : positionFromAngles(hotspot.position?.yaw || 0, hotspot.position?.pitch || 0, 8),
    [hotspot.position?.yaw, hotspot.position?.pitch, hotspot.spatialPosition, spatial],
  )
  const quaternion = useMemo(
    () => spatial ? new THREE.Quaternion() : inwardQuaternion(position),
    [position, spatial],
  )
  const haloScale = HALO_SCALE[style.preset] || HALO_SCALE.navigation
  const activate = () => onActivate?.(hotspot)

  useEffect(() => {
    root.current?.traverse?.((object) => object.layers.enable(INTERACTION_LAYER))
  }, [])

  useFrame(({ clock }) => {
    if (!root.current) return

    if (spatial) {
      if (style.preset === 'floor') {
        root.current.rotation.set(-Math.PI / 2, 0, 0)
      } else {
        const viewCamera = gl.xr.isPresenting ? gl.xr.getCamera(camera) : camera
        const cameraWorld = viewCamera.getWorldQuaternion(new THREE.Quaternion())
        const parentWorld = root.current.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion()
        root.current.quaternion.copy(parentWorld.invert().multiply(cameraWorld))
      }
    }

    const guidePulse = guideHighlight ? 1 + Math.sin(clock.elapsedTime * 6) * 0.08 : 1
    root.current.scale.setScalar(baseScale * guidePulse)

    if (halo.current) {
      const pulse = 1 + (guideHighlight ? (Math.sin(clock.elapsedTime * 5) + 1) * 0.13 : 0)
      halo.current.scale.set(
        haloScale[0] * pulse,
        haloScale[1] * pulse,
        haloScale[2],
      )
      halo.current.visible = guideHighlight || selected
    }

    if (haloMaterial.current) {
      haloMaterial.current.opacity = guideHighlight
        ? 0.48 + (Math.sin(clock.elapsedTime * 5) + 1) * 0.18
        : selected ? 0.7 : 0
    }
  })

  return (
    <group
      ref={root}
      position={position.toArray()}
      quaternion={quaternion.toArray()}
      scale={baseScale}
      userData={{
        interactionTarget: true,
        interactionId: hotspot.id,
        activate,
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (editMode) onSelect?.(hotspot.id)
        else if (pointerEnabled) interaction.activateObject(event.object, 'pointer')
      }}
    >
      <HotspotGeometry
        preset={style.preset}
        color={selected ? '#ffd88a' : style.color}
        opacity={style.opacity}
      />

      <mesh ref={halo} position={[0, 0, 0.01]} visible={guideHighlight || selected}>
        <ringGeometry args={[0.32, 0.38, 48]} />
        <meshBasicMaterial
          ref={haloMaterial}
          color={guideHighlight ? '#7fd7ff' : '#ffd88a'}
          transparent
          opacity={guideHighlight ? 0.6 : 0.7}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
