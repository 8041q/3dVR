import React, { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import Hotspot from './Hotspot'

const RADIUS = 500

function createPlaceholderTexture(text = 'Placeholder') {
  const width = 2048
  const height = 1024
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#444'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#ddd'
  ctx.font = '48px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(text, width / 2, height / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function useTextureSafe(url) {
  const [tex, setTex] = useState(null)

  useEffect(() => {
    let mounted = true
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (t) => {
        if (!mounted) return
        t.wrapS = THREE.RepeatWrapping
        t.wrapT = THREE.RepeatWrapping
        // Flip horizontally for inside-facing sphere UVs (fixes mirrored panoramas)
        t.repeat.x *= -1
        t.needsUpdate = true
        setTex(t)
      },
      undefined,
      () => {
        if (!mounted) return
        setTex(createPlaceholderTexture('Missing image'))
      }
    )
    return () => {
      mounted = false
    }
  }, [url])

  return tex
}

function Sphere({ texture }) {
  return (
    <mesh>
      <sphereGeometry args={[RADIUS, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  )
}

function toPosition(pos) {
  // Accept either [x,y,z] or {yaw, pitch, dist}
  if (!pos) return [0, 0, -RADIUS + 10]
  if (Array.isArray(pos) && pos.length === 3) return pos
  if (typeof pos === 'object' && (pos.yaw !== undefined || pos.pitch !== undefined)) {
    const yaw = (pos.yaw || 0) * (Math.PI / 180) // degrees -> rad
    const pitch = (pos.pitch || 0) * (Math.PI / 180)
    const dist = pos.dist || (RADIUS - 10)
    const x = Math.sin(yaw) * Math.cos(pitch) * dist
    const y = Math.sin(pitch) * dist
    const z = -Math.cos(yaw) * Math.cos(pitch) * dist
    return [x, y, z]
  }
  return [0, 0, -RADIUS + 10]
}

function Scene({ scene, onHotspotClick }) {
  const texture = useTextureSafe(scene.src)
  if (!texture) return null
  return (
    <group>
      <Sphere texture={texture} />
      {scene.hotspots?.map((h) => (
        <Hotspot key={h.id} position={toPosition(h.position)} label={h.label} onClick={() => onHotspotClick(h.target)} />
      ))}
    </group>
  )
}

export default function Viewer({ sceneId, onNavigate, scenes }) {
  const [current, setCurrent] = useState(scenes.find((s) => s.id === sceneId))
  const prevSceneRef = useRef(current)

  useEffect(() => {
    const next = scenes.find((s) => s.id === sceneId)
    if (next && next.id !== current.id) {
      prevSceneRef.current = current
      setCurrent(next)
    }
  }, [sceneId])

  return (
    <div className="viewer">
        <Canvas camera={{ fov: 75, position: [0, 0, 0.1] }}>
        <Suspense fallback={null}>
          <Scene scene={current} onHotspotClick={(id) => onNavigate(id)} />
        </Suspense>
          <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={-1} />
      </Canvas>
    </div>
  )
}

