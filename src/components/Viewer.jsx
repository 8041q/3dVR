import React, { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { OrbitControls } from '@react-three/drei'
import Hotspot from './Hotspot'
import GazeCursor from './GazeCursor'
import PhoneOrientationControls from './PhoneOrientationControls'
import { worldPointToYawPitch } from '../utils/coords'

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
    console.log('[Viewer] loading texture', url)
    loader.load(
      url,
      (t) => {
        if (!mounted) return
        console.log('[Viewer] texture loaded', url)
        t.wrapS = THREE.RepeatWrapping
        t.wrapT = THREE.RepeatWrapping
        // Flip horizontally for inside-facing sphere UVs (fixes mirrored panoramas)
        t.repeat.x *= -1
        t.needsUpdate = true
        setTex(t)
      },
      undefined,
      (err) => {
        console.error('[Viewer] texture load error', url, err)
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

// Forces tone mapping off on the WebGL renderer after it is fully created.
// The gl prop on <Canvas> only passes constructor params; this is the R3F v8
// reliable way to set renderer properties post-init.
function RendererConfig() {
  const { gl } = useThree()
  useLayoutEffect(() => {
    gl.toneMapping = THREE.NoToneMapping
    gl.toneMappingExposure = 1
  }, [gl])
  return null
}

// Dual-sphere panorama with GSAP crossfade and texture preloading
function PanoramaScene({ scene, scenes, onHotspotClick, editMode, placingHotspot, selectedHotspotId, onSelectHotspot, onHotspotMove, onDragStateChange }) {
  const matA = useRef(new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 1 }))
  const matB = useRef(new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 0 }))
  const meshARef = useRef()
  const meshBRef = useRef()
  const activeRef = useRef('A') // which sphere is currently showing
  const cache = useRef({}) // url → THREE.Texture
  const prevSceneId = useRef(null)

  function loadTexture(url) {
    if (cache.current[url]) return Promise.resolve(cache.current[url])
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader()
      loader.load(
        url,
        (t) => {
          t.wrapS = THREE.RepeatWrapping
          t.wrapT = THREE.RepeatWrapping
          t.repeat.x = -1
          t.needsUpdate = true
          cache.current[url] = t
          resolve(t)
        },
        undefined,
        () => {
          const placeholder = createPlaceholderTexture('Missing image')
          cache.current[url] = placeholder
          resolve(placeholder)
        }
      )
    })
  }

  // Initial load
  useEffect(() => {
    loadTexture(scene.src).then((tex) => {
      matA.current.map = tex
      matA.current.needsUpdate = true
      matA.current.opacity = 1
      matB.current.opacity = 0
      activeRef.current = 'A'
      prevSceneId.current = scene.id
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Crossfade when scene changes
  useEffect(() => {
    if (!prevSceneId.current || prevSceneId.current === scene.id) {
      prevSceneId.current = scene.id
      return
    }
    prevSceneId.current = scene.id

    loadTexture(scene.src).then((tex) => {
      const isAActive = activeRef.current === 'A'
      const incoming = isAActive ? matB.current : matA.current
      const outgoing = isAActive ? matA.current : matB.current

      incoming.map = tex
      incoming.needsUpdate = true
      incoming.opacity = 0

      gsap.killTweensOf([outgoing, incoming])
      gsap.to(incoming, { opacity: 1, duration: 0.55, ease: 'power2.inOut' })
      gsap.to(outgoing, {
        opacity: 0,
        duration: 0.55,
        ease: 'power2.inOut',
        onComplete: () => {
          outgoing.map = null
          outgoing.needsUpdate = true
        },
      })
      activeRef.current = isAActive ? 'B' : 'A'
    })
  }, [scene.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Preload adjacent scene textures in the background
  useEffect(() => {
    for (const h of scene.hotspots ?? []) {
      const targetScene = scenes.find((s) => s.id === h.target)
      if (targetScene?.src) loadTexture(targetScene.src)
    }
  }, [scene.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const [draggingId, setDraggingId] = useState(null)
  const { gl, camera } = useThree()

  // Drag-to-reposition: while dragging, move hotspot along the panorama sphere
  useEffect(() => {
    if (!draggingId || !onHotspotMove) return

    const dragSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), RADIUS - 10)
    const raycaster = new THREE.Raycaster()
    const canvas = gl.domElement

    function handleMove(e) {
      const rect = canvas.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera({ x, y }, camera)
      const hit = new THREE.Vector3()
      if (raycaster.ray.intersectSphere(dragSphere, hit)) {
        const { yaw, pitch } = worldPointToYawPitch(hit)
        onHotspotMove(draggingId, yaw, pitch)
      }
    }

    function handleUp() {
      setDraggingId(null)
      onDragStateChange && onDragStateChange(false)
      document.body.style.cursor = ''
    }

    document.body.style.cursor = 'grabbing'
    canvas.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    return () => {
      canvas.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
  }, [draggingId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDragStart(id) {
    setDraggingId(id)
    onDragStateChange && onDragStateChange(true)
  }

  function handleSphereClick(e) {
    if (!placingHotspot) return
    e.stopPropagation()
    const { yaw, pitch } = worldPointToYawPitch(e.point)
    window.dispatchEvent(new CustomEvent('vr:placeHotspot', { detail: { yaw, pitch } }))
  }

  return (
    <group>
      {/* Sphere A */}
      <mesh ref={meshARef} onClick={handleSphereClick}
        onPointerOver={() => { if (placingHotspot) document.body.style.cursor = 'crosshair' }}
        onPointerOut={() => { document.body.style.cursor = '' }}>
        <sphereGeometry args={[RADIUS, 60, 40]} />
        <primitive object={matA.current} attach="material" />
      </mesh>
      {/* Sphere B */}
      <mesh ref={meshBRef}>
        <sphereGeometry args={[RADIUS, 60, 40]} />
        <primitive object={matB.current} attach="material" />
      </mesh>

      {scene.hotspots?.map((h) => (
        <Hotspot
          key={h.id}
          id={h.id}
          position={toPosition(h.position)}
          label={h.label}
          shape={h.shape ?? 'sphere'}
          size={h.size ?? 1}
          selected={editMode && h.id === selectedHotspotId}
          editMode={editMode}
          onDragStart={editMode ? handleDragStart : undefined}
          onClick={() => {
            if (editMode) {
              onSelectHotspot(h.id)
            } else {
              onHotspotClick(h.target)
            }
          }}
        />
      ))}
    </group>
  )
}

function toPosition(pos) {
  // Accept either [x,y,z] or {yaw, pitch, dist}
  if (!pos) return [0, 0, -RADIUS + 10]
  if (Array.isArray(pos) && pos.length === 3) return pos
  if (typeof pos === 'object' && (pos.yaw !== undefined || pos.pitch !== undefined)) {
    const yaw = (pos.yaw || 0) * (Math.PI / 180)
    const pitch = (pos.pitch || 0) * (Math.PI / 180)
    const dist = pos.dist || (RADIUS - 10)
    const x = Math.sin(yaw) * Math.cos(pitch) * dist
    const y = Math.sin(pitch) * dist
    const z = -Math.cos(yaw) * Math.cos(pitch) * dist
    return [x, y, z]
  }
  return [0, 0, -RADIUS + 10]
}

export default function Viewer({ sceneId, onNavigate, scenes, mode = 'pc', editMode = false, placingHotspot = false, selectedHotspotId = null, onSelectHotspot, onHotspotMove }) {
  const enterXRRef = useRef(null)
  const [phoneEnabled, setPhoneEnabled] = useState(false)
  const [phoneTrackingState, setPhoneTrackingState] = useState('idle')
  const [phoneError, setPhoneError] = useState('')
  const [phoneRecenterToken, setPhoneRecenterToken] = useState(0)
  const [xrSupport, setXrSupport] = useState('unknown')
  const [isDragging, setIsDragging] = useState(false)
  const useGazeCursor = mode === 'phone' || mode === 'vr'

  const currentScene = scenes.find((s) => s.id === sceneId) ?? scenes[0]

  useEffect(() => {
    if (mode !== 'vr') return undefined

    let cancelled = false

    async function checkXRSupport() {
      if (typeof navigator === 'undefined' || !navigator.xr) {
        setXrSupport('unsupported')
        return
      }

      if (typeof navigator.xr.isSessionSupported !== 'function') {
        setXrSupport('supported')
        return
      }

      setXrSupport('checking')

      try {
        const supported = await navigator.xr.isSessionSupported('immersive-vr')
        if (!cancelled) {
          setXrSupport(supported ? 'supported' : 'unsupported')
        }
      } catch (error) {
        console.error('[Viewer] XR capability check failed', error)
        if (!cancelled) {
          setXrSupport('error')
        }
      }
    }

    checkXRSupport()

    return () => {
      cancelled = true
    }
  }, [mode])

  const isSecureContext = typeof window === 'undefined' ? true : window.isSecureContext
  const hasPhoneOrientationSupport = typeof window !== 'undefined' && (
    'DeviceOrientationEvent' in window || 'ondeviceorientation' in window
  )
  const needsOrientationPermission = typeof window !== 'undefined' &&
    typeof window.DeviceOrientationEvent !== 'undefined' &&
    typeof window.DeviceOrientationEvent.requestPermission === 'function'

  async function enablePhoneOrientation() {
    if (!isSecureContext) {
      setPhoneError('Phone motion needs HTTPS or localhost on the device itself.')
      setPhoneTrackingState('insecure')
      return
    }

    if (!hasPhoneOrientationSupport) {
      setPhoneError('This browser does not expose device orientation sensors.')
      setPhoneTrackingState('unsupported')
      return
    }

    setPhoneError('')

    try {
      if (needsOrientationPermission) {
        const permission = await window.DeviceOrientationEvent.requestPermission()
        if (permission !== 'granted') {
          setPhoneEnabled(false)
          setPhoneTrackingState('denied')
          return
        }
      }

      setPhoneEnabled(true)
      setPhoneTrackingState('listening')
    } catch (error) {
      console.error('[Viewer] Device orientation permission failed', error)
      setPhoneEnabled(false)
      setPhoneError(error?.message || 'Could not enable device orientation.')
      setPhoneTrackingState('error')
    }
  }

  function renderPhonePanel() {
    if (mode !== 'phone') return null

    let message = 'Tap Enable Motion, then point the phone where you want to look.'

    if (!isSecureContext) {
      message = 'Phone motion is blocked here. Open the app from HTTPS or localhost on the phone.'
    } else if (!hasPhoneOrientationSupport) {
      message = 'This browser does not expose device orientation sensors.'
    } else if (phoneTrackingState === 'active') {
      message = 'Phone motion is active. If forward feels off, use Recenter.'
    } else if (phoneTrackingState === 'listening') {
      message = 'Waiting for motion data. Move the phone after enabling sensors.'
    } else if (phoneTrackingState === 'no-data') {
      message = 'No motion data arrived. Check browser permissions and whether this page is secure.'
    } else if (phoneTrackingState === 'denied') {
      message = 'Motion permission was denied. Re-enable it in the browser and try again.'
    } else if (phoneTrackingState === 'error' && phoneError) {
      message = phoneError
    }

    return (
      <div className="viewer-panel viewer-panel--right">
        <p className="viewer-panel__title">Phone Mode</p>
        <p>{message}</p>
        <div className="viewer-panel__actions">
          {isSecureContext && hasPhoneOrientationSupport && !phoneEnabled && (
            <button onClick={enablePhoneOrientation}>Enable Motion</button>
          )}
          {phoneEnabled && (
            <button onClick={() => setPhoneRecenterToken((value) => value + 1)}>Recenter</button>
          )}
        </div>
      </div>
    )
  }

  function renderVrPanel() {
    if (mode !== 'vr') return null

    let message = 'Enter headset VR when a compatible WebXR runtime is available.'

    if (xrSupport === 'checking') {
      message = 'Checking headset VR support...'
    } else if (xrSupport === 'unsupported') {
      message = 'Headset VR is not available in this browser or on this device.'
    } else if (xrSupport === 'error') {
      message = 'Headset VR could not be initialized in this browser.'
    }

    return (
      <div className="viewer-panel viewer-panel--right">
        <p className="viewer-panel__title">Headset VR</p>
        <p>{message}</p>
        {xrSupport === 'supported' && (
          <div className="viewer-panel__actions">
            <button
              onClick={async () => {
                if (enterXRRef.current) {
                  try {
                    await enterXRRef.current()
                  } catch (error) {
                    console.error('Enter XR failed', error)
                    alert('Failed to enter XR: ' + (error && error.message))
                  }
                } else {
                  alert('XR not available in this context')
                }
              }}
            >
              Enter VR
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="viewer">
      <Canvas gl={{ toneMapping: THREE.NoToneMapping }} camera={{ fov: 75, position: [0, 0, 0.1] }}>
        <Suspense fallback={null}>
          <RendererConfig />
          <PanoramaScene
            scene={currentScene}
            scenes={scenes}
            onHotspotClick={(id) => onNavigate(id)}
            editMode={editMode}
            placingHotspot={placingHotspot}
            selectedHotspotId={selectedHotspotId}
            onSelectHotspot={onSelectHotspot}
            onHotspotMove={onHotspotMove}
            onDragStateChange={setIsDragging}
          />
          {useGazeCursor && <GazeCursor dwell={1.2} />}
          <PhoneOrientationControls
            active={mode === 'phone' && phoneEnabled}
            recenterToken={phoneRecenterToken}
            onStateChange={setPhoneTrackingState}
          />
          <XRSessionBinder register={(fn) => (enterXRRef.current = fn)} />
          {mode === 'pc' && <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={-0.5} enabled={!isDragging} />}
        </Suspense>
      </Canvas>
      {renderPhonePanel()}
      {renderVrPanel()}
    </div>
  )
}

function XRSessionBinder({ register }) {
  const { gl } = useThree()
  useEffect(() => {
    if (!register) return
    register(async () => {
      if (!navigator.xr) throw new Error('WebXR not supported')
      if (typeof navigator.xr.isSessionSupported === 'function') {
        const supported = await navigator.xr.isSessionSupported('immersive-vr')
        if (!supported) throw new Error('Immersive VR is not supported on this device')
      }
      gl.xr.enabled = true
      const session = await navigator.xr.requestSession('immersive-vr')
      await gl.xr.setSession(session)
    })
    return () => register(null)
  }, [gl, register])
  return null
}

// XR setup removed: using plain Canvas + GazeCursor for now to avoid XR runtime errors

