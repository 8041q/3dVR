import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

const IDLE_COLOR = new THREE.Color('#2a6ebf')
const HOVER_COLOR = new THREE.Color('#5bbfe8')
const SELECTED_COLOR = new THREE.Color('#f59e0b')

const _WORLD_UP = new THREE.Vector3(0, 1, 0)
const _WORLD_FWD = new THREE.Vector3(0, 0, 1)

/**
 * Billboard rotation that keeps world-up stable.
 * The flat shape's +Z is aimed at the camera (origin).
 * The local +Y is aligned with world up as closely as possible,
 * so circle/arrow shapes don't spin to arbitrary orientations.
 */
function billboardRotation(position) {
  const pos = new THREE.Vector3(...position)
  if (pos.lengthSq() === 0) return [0, 0, 0]

  const faceDir = pos.clone().normalize().negate() // +Z toward camera

  // Project world-up onto the plane perpendicular to faceDir
  const dot = _WORLD_UP.dot(faceDir)
  let up = _WORLD_UP.clone().addScaledVector(faceDir, -dot)
  if (up.lengthSq() < 1e-6) {
    // Degenerate: hotspot is directly overhead or underfoot
    up = _WORLD_FWD.clone()
  } else {
    up.normalize()
  }

  const right = up.clone().cross(faceDir).normalize()
  const mat = new THREE.Matrix4().makeBasis(right, up, faceDir)
  const q = new THREE.Quaternion().setFromRotationMatrix(mat)
  const e = new THREE.Euler().setFromQuaternion(q)
  return [e.x, e.y, e.z]
}

export default function Hotspot({
  id,
  position = [0, 0, 0],
  label,
  onClick,
  onDragStart,
  shape = 'sphere',
  size = 1,
  editMode = false,
  selected = false,
}) {
  const ref = useRef()
  const [pointerHovered, setPointerHovered] = useState(false)
  const [gazeHovered, setGazeHovered] = useState(false)

  useEffect(() => {
    if (!ref.current) return undefined
    const mesh = ref.current
    mesh.userData.hotspotId = id
    mesh.userData.isGazeTarget = true
    mesh.userData.activate = () => onClick && onClick()
    mesh.userData.setGazeHovered = setGazeHovered
    // Capture initial scale for gaze-dwell feedback
    mesh.userData.originalScale = mesh.scale.clone()
    return () => {
      delete mesh.userData.hotspotId
      delete mesh.userData.isGazeTarget
      delete mesh.userData.activate
      delete mesh.userData.setGazeHovered
      delete mesh.userData.originalScale
    }
  }, [id, onClick, shape])

  const isHovered = pointerHovered || gazeHovered
  const color = selected ? SELECTED_COLOR : isHovered ? HOVER_COLOR : IDLE_COLOR

  // Billboard rotation — computed once per shape/position change
  const groupRotation = useMemo(() => {
    if (shape === 'sphere') return [0, 0, 0]
    return billboardRotation(position)
  }, [shape, position[0], position[1], position[2]])  // eslint-disable-line react-hooks/exhaustive-deps

  const events = {
    onPointerOver: (e) => {
      e.stopPropagation()
      setPointerHovered(true)
      if (editMode && selected) document.body.style.cursor = 'grab'
    },
    onPointerOut: (e) => {
      e.stopPropagation()
      setPointerHovered(false)
      document.body.style.cursor = ''
    },
    onPointerDown: (e) => {
      if (editMode && selected && onDragStart) {
        e.stopPropagation()
        onDragStart(id)
      }
    },
    onClick: (e) => { e.stopPropagation(); onClick && onClick() },
  }

  // ── sphere ──────────────────────────────────────────────────────────────────
  if (shape === 'sphere') {
    return (
      <mesh ref={ref} position={position} {...events}>
        <sphereGeometry args={[6 * size, 16, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    )
  }

  // ── circle ──────────────────────────────────────────────────────────────────
  if (shape === 'circle') {
    return (
      <group position={position} rotation={groupRotation}>
        <mesh ref={ref} {...events}>
          <circleGeometry args={[8 * size, 48]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
      </group>
    )
  }

  // ── arrow ── cone tip pointing toward world -Y (floor) in the billboard plane
  if (shape === 'arrow') {
    return (
      <group position={position} rotation={groupRotation}>
        {/* Math.PI flip on X: cone default tip is +Y; flipped tip points -Y = world floor */}
        <mesh ref={ref} rotation={[Math.PI, 0, 0]} {...events}>
          <coneGeometry args={[7 * size, 16 * size, 3]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
      </group>
    )
  }

  // ── oval ── billboard-facing ellipse with forward tilt for floor-perspective look
  // groupRotation faces camera; inner tilt + squish scale creates the floor-marker effect
  return (
    <group position={position} rotation={groupRotation}>
      <mesh ref={ref} rotation={[0.3, 0, 0]} scale={[1.8 * size, 0.55 * size, 1]} {...events}>
        <circleGeometry args={[6, 48]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
