import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

function disposeObject(root) {
  const textures = new Set()
  root?.traverse?.((child) => {
    if (!child.isMesh) return
    child.geometry?.dispose?.()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!material) continue
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value)
      }
      material.dispose?.()
    }
  })
  for (const texture of textures) texture.dispose?.()
}

function headsetYaw(camera) {
  const direction = new THREE.Vector3()
  camera.getWorldDirection(direction)
  direction.y = 0
  if (direction.lengthSq() < 0.0001) return 0
  direction.normalize()
  return Math.atan2(-direction.x, -direction.z)
}

function configureAction(action, { behavior = 'toggle', loop = 'once', speed = 1 } = {}) {
  const loopMode = loop === 'repeat' ? THREE.LoopRepeat : THREE.LoopOnce
  action.setLoop(loopMode, loopMode === THREE.LoopRepeat ? Infinity : 1)
  action.clampWhenFinished = loopMode === THREE.LoopOnce
  action.timeScale = Number.isFinite(Number(speed)) ? Number(speed) : 1
  action.enabled = true
  action.paused = false
  if (behavior === 'restart') action.reset()
}

/**
 * Blender spatial scene runtime.
 *
 * The room is anchored once to the initial tracked headset pose. The room then
 * remains fixed so physical leaning/crouching produces real parallax.
 *
 * Animations are played directly from the room GLB. This intentionally keeps
 * furniture/products in the room instead of extracting duplicate inspect GLBs.
 */
const SpatialScene = forwardRef(function SpatialScene({ scene, children, onStatusChange }, ref) {
  const { camera, gl, scene: threeScene } = useThree()
  const rootRef = useRef(null)
  const anchoredRef = useRef(false)
  const mixerRef = useRef(null)
  const clipsRef = useRef(new Map())
  const actionsRef = useRef(new Map())
  const [model, setModel] = useState(null)
  const [error, setError] = useState('')
  const roomUrl = scene?.spatial?.roomUrl

  const environmentIntensity = Number(scene?.spatial?.environmentIntensity ?? 0.85)
  const exposure = Number(scene?.spatial?.exposure ?? 1)

  useImperativeHandle(ref, () => ({
    getAnimationNames: () => [...clipsRef.current.keys()],
    playAnimation: (clipName, options = {}) => {
      const clip = clipsRef.current.get(clipName)
      const mixer = mixerRef.current
      if (!clip || !mixer) return false

      let action = actionsRef.current.get(clipName)
      if (!action) {
        action = mixer.clipAction(clip)
        actionsRef.current.set(clipName, action)
      }

      const behavior = options.behavior || 'toggle'
      if (behavior === 'toggle' && action.isRunning() && !action.paused) {
        action.paused = true
        return true
      }
      if (behavior === 'toggle' && action.paused) {
        action.paused = false
        return true
      }

      configureAction(action, options)
      if (behavior === 'restart') action.reset()
      action.play()
      return true
    },
    stopAnimation: (clipName) => {
      const action = actionsRef.current.get(clipName)
      if (!action) return false
      action.stop()
      return true
    },
    resetAnimations: () => {
      mixerRef.current?.stopAllAction()
      mixerRef.current?.setTime(0)
      return true
    },
  }))

  useEffect(() => {
    anchoredRef.current = false
    if (rootRef.current) {
      rootRef.current.position.set(0, 0, 0)
      rootRef.current.rotation.set(0, 0, 0)
    }
  }, [roomUrl])

  useFrame((_, delta) => {
    mixerRef.current?.update(Math.min(delta, 0.1))

    if (anchoredRef.current || !rootRef.current || !gl.xr.isPresenting) return
    const xrCamera = gl.xr.getCamera(camera)
    const position = new THREE.Vector3()
    xrCamera.getWorldPosition(position)
    rootRef.current.position.copy(position)
    rootRef.current.rotation.set(0, headsetYaw(xrCamera), 0)
    anchoredRef.current = true
  })

  useEffect(() => {
    if (!roomUrl) {
      setModel(null)
      setError('Spatial scene is missing roomUrl.')
      onStatusChange?.({ state: 'error', error: 'Spatial scene is missing roomUrl.' })
      return undefined
    }

    let disposed = false
    let loaded = null
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)

    const draco = new DRACOLoader()
    draco.setDecoderPath('/vendor/draco/')
    loader.setDRACOLoader(draco)

    const ktx2 = new KTX2Loader()
    ktx2.setTranscoderPath('/vendor/basis/')
    ktx2.detectSupport(gl)
    loader.setKTX2Loader(ktx2)

    setError('')
    onStatusChange?.({ state: 'loading', progress: 0 })

    loader.load(
      roomUrl,
      (gltf) => {
        if (disposed) return
        loaded = cloneSkeleton(gltf.scene)
        loaded.traverse((child) => {
          if (!child.isMesh) return
          child.frustumCulled = true
          child.castShadow = false
          child.receiveShadow = false
        })

        clipsRef.current = new Map((gltf.animations || []).map((clip) => [clip.name, clip]))
        actionsRef.current = new Map()
        mixerRef.current = new THREE.AnimationMixer(loaded)
        setModel(loaded)
        onStatusChange?.({
          state: 'ready',
          progress: 1,
          animations: [...clipsRef.current.keys()],
        })
      },
      (event) => {
        if (!event?.total) return
        onStatusChange?.({
          state: 'loading',
          progress: Math.max(0, Math.min(1, event.loaded / event.total)),
        })
      },
      (loadError) => {
        if (disposed) return
        const message = loadError?.message || 'Could not load the Blender spatial room.'
        setError(message)
        onStatusChange?.({ state: 'error', error: message })
      },
    )

    return () => {
      disposed = true
      mixerRef.current?.stopAllAction()
      mixerRef.current?.uncacheRoot(loaded)
      mixerRef.current = null
      clipsRef.current = new Map()
      actionsRef.current = new Map()
      draco.dispose()
      ktx2.dispose()
      if (loaded) disposeObject(loaded)
      setModel(null)
    }
  }, [gl, onStatusChange, roomUrl])

  useEffect(() => {
    const previousEnvironment = threeScene.environment
    const previousIntensity = threeScene.environmentIntensity
    const previousToneMapping = gl.toneMapping
    const previousExposure = gl.toneMappingExposure

    const pmrem = new THREE.PMREMGenerator(gl)
    const roomEnvironment = new RoomEnvironment()
    const target = pmrem.fromScene(roomEnvironment, 0.04)
    roomEnvironment.dispose()

    threeScene.environment = target.texture
    threeScene.environmentIntensity = Number.isFinite(environmentIntensity) ? environmentIntensity : 0.85
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = Number.isFinite(exposure) ? exposure : 1

    return () => {
      if (threeScene.environment === target.texture) threeScene.environment = previousEnvironment
      threeScene.environmentIntensity = previousIntensity
      gl.toneMapping = previousToneMapping
      gl.toneMappingExposure = previousExposure
      target.dispose()
      pmrem.dispose()
    }
  }, [environmentIntensity, exposure, gl, threeScene])

  const floorMarker = useMemo(() => {
    const height = Number(scene?.spatial?.cameraHeight)
    return Number.isFinite(height) ? -height : null
  }, [scene?.spatial?.cameraHeight])

  return (
    <group ref={rootRef}>
      {model && <primitive object={model} />}
      {children}
      {error && (
        <mesh position={[0, 0, -2]}>
          <planeGeometry args={[1.5, 0.35]} />
          <meshBasicMaterial color="#4d1515" transparent opacity={0.8} />
        </mesh>
      )}
      {import.meta.env.DEV && floorMarker != null && (
        <gridHelper args={[4, 8, '#3b5464', '#22303a']} position={[0, floorMarker, 0]} />
      )}
    </group>
  )
})

export default SpatialScene
