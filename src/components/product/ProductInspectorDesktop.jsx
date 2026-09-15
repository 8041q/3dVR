import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import {
  applyMaterialVariant,
  resetObjectMaterials,
  resolveAnimationControls,
} from '../../product/productControls'

const TARGET_SIZE = 1.75

function cloneModelMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh) return
    const list = Array.isArray(child.material) ? child.material : [child.material]
    const cloned = list.map((material) => material?.clone?.() || material)
    child.material = Array.isArray(child.material) ? cloned : cloned[0]
  })
}

function prepareModel(object, requestedScale = 1) {
  object.updateMatrixWorld(true)
  const sourceBox = new THREE.Box3().setFromObject(object)
  const sourceSize = sourceBox.getSize(new THREE.Vector3())
  const center = sourceBox.getCenter(new THREE.Vector3())
  const maxDimension = Math.max(sourceSize.x, sourceSize.y, sourceSize.z, 0.0001)
  const fit = (TARGET_SIZE / maxDimension) * Math.max(0.01, Number(requestedScale) || 1)

  object.position.sub(center)
  object.scale.setScalar(fit)
  object.updateMatrixWorld(true)

  const fittedBox = new THREE.Box3().setFromObject(object)
  const fittedCenter = fittedBox.getCenter(new THREE.Vector3())
  object.position.x -= fittedCenter.x
  object.position.z -= fittedCenter.z
  object.position.y -= fittedBox.min.y
  object.updateMatrixWorld(true)

  const normalizedBox = new THREE.Box3().setFromObject(object)
  const normalizedSize = normalizedBox.getSize(new THREE.Vector3())
  return {
    object,
    sourceSize: sourceSize.toArray(),
    normalizedBox,
    normalizedSize,
  }
}

function disposeObject(object) {
  const textures = new Set()
  object?.traverse?.((child) => {
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

function formatDimension(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 10) return n.toFixed(1)
  if (Math.abs(n) >= 1) return n.toFixed(2)
  return n.toFixed(3)
}

function AnnotationMarker({ model, annotation, active, onSelect }) {
  const anchor = annotation.anchorNode ? model?.getObjectByName?.(annotation.anchorNode) : null
  const position = anchor && Array.isArray(annotation.anchorPosition)
    ? annotation.anchorPosition
    : (annotation.position || [0, 0.8, 0])
  const normal = anchor && Array.isArray(annotation.anchorNormal)
    ? annotation.anchorNormal
    : (annotation.normal || [0, 0, 1])
  const offset = new THREE.Vector3(...normal).normalize().multiplyScalar(0.018)
  const markerPosition = new THREE.Vector3(...position).add(offset).toArray()

  const mesh = (
    <mesh
      position={markerPosition}
      renderOrder={20}
      onClick={(event) => {
        event.stopPropagation()
        onSelect?.(annotation.id)
      }}
    >
      <sphereGeometry args={[active ? 0.045 : 0.032, 20, 14]} />
      <meshBasicMaterial
        color={active ? '#ffffff' : '#a9c5ff'}
        depthTest
        toneMapped={false}
      />
    </mesh>
  )

  return anchor ? createPortal(mesh, anchor) : mesh
}

const InspectorScene = forwardRef(function InspectorScene({
  inspection,
  autoRotate,
  selectedAnnotationId,
  onAnimationsChange,
  onStatusChange,
  onMetadataChange,
  onAnimationStateChange,
  onAnnotationSelect,
}, ref) {
  const { camera, gl, scene } = useThree()
  const controlsRef = useRef(null)
  const rootRef = useRef(null)
  const mixerRef = useRef(null)
  const actionsRef = useRef(new Map())
  const activeActionRef = useRef(null)
  const environmentRef = useRef(null)
  const initialCameraRef = useRef(null)
  const [model, setModel] = useState(null)

  const settings = inspection.viewer || {}
  const animationSpeed = Math.max(0.05, Number(settings.animationSpeed) || 1)

  const fitCamera = useCallback((box, immediate = false) => {
    const controls = controlsRef.current
    if (!controls || !box || box.isEmpty()) return false

    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(size.length() * 0.5, 0.2)
    const verticalFov = THREE.MathUtils.degToRad(camera.fov || 42)
    const distance = (radius / Math.sin(verticalFov / 2)) * 1.15

    const azimuth = THREE.MathUtils.degToRad(Number(settings.azimuth ?? 32))
    const polar = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(Number(settings.polar ?? 68), 8, 172))
    const direction = new THREE.Vector3(
      Math.sin(polar) * Math.sin(azimuth),
      Math.cos(polar),
      Math.sin(polar) * Math.cos(azimuth),
    )

    const minZoom = THREE.MathUtils.clamp(Number(settings.minZoom ?? 0.65), 0.15, 1.5)
    const maxZoom = Math.max(minZoom + 0.1, Number(settings.maxZoom ?? 3))
    controls.minDistance = Math.max(radius * 0.6, distance / maxZoom)
    controls.maxDistance = Math.max(controls.minDistance + 0.2, distance / minZoom)

    const target = center.clone().add(new THREE.Vector3(0, size.y * 0.05, 0))
    const nextPosition = target.clone().add(direction.multiplyScalar(distance))

    controls.target.copy(target)
    camera.position.copy(nextPosition)
    camera.near = Math.max(0.005, distance / 500)
    camera.far = Math.max(50, distance * 20)
    camera.updateProjectionMatrix()
    controls.update()

    initialCameraRef.current = {
      position: camera.position.clone(),
      target: controls.target.clone(),
    }

    if (!immediate) controls.saveState()
    return true
  }, [camera, settings.azimuth, settings.maxZoom, settings.minZoom, settings.polar])

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.enablePan = true
    controls.screenSpacePanning = true
    controls.zoomToCursor = true
    controls.rotateSpeed = 0.7
    controls.zoomSpeed = 0.85
    controls.panSpeed = 0.7
    controls.maxPolarAngle = Math.PI * 0.96
    controls.minPolarAngle = Math.PI * 0.03
    controlsRef.current = controls

    return () => {
      controls.dispose()
      controlsRef.current = null
    }
  }, [camera, gl])

  useEffect(() => {
    if (!controlsRef.current) return
    controlsRef.current.autoRotate = Boolean(autoRotate)
    controlsRef.current.autoRotateSpeed = Number(settings.autoRotateSpeed) || 0.65
  }, [autoRotate, settings.autoRotateSpeed])

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const environment = new RoomEnvironment()
    const target = pmrem.fromScene(environment, 0.04)
    environment.dispose()
    environmentRef.current = target.texture
    scene.environment = target.texture
    scene.environmentIntensity = THREE.MathUtils.clamp(Number(settings.environmentIntensity ?? 1), 0, 4)
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = THREE.MathUtils.clamp(Number(settings.exposure ?? 1), 0.1, 3)

    return () => {
      if (scene.environment === target.texture) scene.environment = null
      target.dispose()
      pmrem.dispose()
      environmentRef.current = null
    }
  }, [gl, scene, settings.environmentIntensity, settings.exposure])

  useEffect(() => {
    let disposed = false
    let loadedScene = null
    let mixer = null

    setModel(null)
    rootRef.current = null
    actionsRef.current.clear()
    activeActionRef.current = null
    onAnimationsChange?.([])
    onAnimationStateChange?.({ activeClip: '', playing: false, paused: false, speed: animationSpeed })
    onStatusChange?.({ state: 'loading', progress: 0, error: '' })

    if (!inspection.modelUrl) {
      onStatusChange?.({ state: 'error', progress: 0, error: 'This inspection action has no GLB model URL.' })
      return undefined
    }

    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/vendor/draco/')
    loader.setDRACOLoader(dracoLoader)
    const ktx2Loader = new KTX2Loader()
    ktx2Loader.setTranscoderPath('/vendor/basis/')
    ktx2Loader.detectSupport(gl)
    loader.setKTX2Loader(ktx2Loader)

    loader.load(
      inspection.modelUrl,
      (gltf) => {
        if (disposed) return
        loadedScene = cloneSkeleton(gltf.scene)
        cloneModelMaterials(loadedScene)
        const prepared = prepareModel(loadedScene, inspection.modelScale)

        loadedScene.traverse((child) => {
          if (!child.isMesh) return
          child.castShadow = true
          child.receiveShadow = true
          child.frustumCulled = true
        })

        mixer = new THREE.AnimationMixer(loadedScene)
        mixer.timeScale = animationSpeed
        mixerRef.current = mixer
        actionsRef.current = new Map(
          (gltf.animations || []).map((clip) => [clip.name, mixer.clipAction(clip)]),
        )

        const names = (gltf.animations || []).map((clip) => clip.name).filter(Boolean)
        rootRef.current = loadedScene
        setModel(loadedScene)
        onAnimationsChange?.(names)
        onMetadataChange?.({
          sourceSize: prepared.sourceSize,
          normalizedSize: prepared.normalizedSize.toArray(),
          meshes: (() => {
            let count = 0
            loadedScene.traverse((child) => { if (child.isMesh) count += 1 })
            return count
          })(),
          materials: (() => {
            const namesSet = new Set()
            loadedScene.traverse((child) => {
              if (!child.isMesh) return
              const list = Array.isArray(child.material) ? child.material : [child.material]
              for (const material of list) if (material?.name) namesSet.add(material.name)
            })
            return namesSet.size
          })(),
        })
        onStatusChange?.({ state: 'ready', progress: 1, error: '' })

        requestAnimationFrame(() => fitCamera(prepared.normalizedBox, true))
      },
      (event) => {
        if (disposed) return
        const total = Number(event.total) || 0
        const loaded = Number(event.loaded) || 0
        const progress = total > 0 ? THREE.MathUtils.clamp(loaded / total, 0, 0.98) : null
        onStatusChange?.({ state: 'loading', progress, loaded, total, error: '' })
      },
      (error) => {
        if (disposed) return
        console.error('[product-inspector] GLB load failed', error)
        onStatusChange?.({
          state: 'error',
          progress: 0,
          error: error?.message || 'Could not load the GLB model.',
        })
      },
    )

    return () => {
      disposed = true
      mixer?.stopAllAction()
      mixerRef.current = null
      actionsRef.current.clear()
      activeActionRef.current = null
      rootRef.current = null
      disposeObject(loadedScene)
      dracoLoader.dispose()
      ktx2Loader.dispose()
    }
  }, [animationSpeed, fitCamera, inspection.modelScale, inspection.modelUrl, onAnimationStateChange, onAnimationsChange, onMetadataChange, onStatusChange])

  function playAnimation(name) {
    const next = actionsRef.current.get(name)
    if (!next) return false
    const previous = activeActionRef.current
    if (previous && previous !== next) previous.fadeOut(0.22)
    next.reset()
    next.enabled = true
    next.paused = false
    next.setLoop(THREE.LoopOnce, 1)
    next.clampWhenFinished = true
    next.fadeIn(0.22)
    next.play()
    activeActionRef.current = next
    onAnimationStateChange?.({ activeClip: name, playing: true, paused: false, speed: mixerRef.current?.timeScale || animationSpeed })
    return true
  }

  function toggleAnimation() {
    const action = activeActionRef.current
    if (!action) return false
    action.paused = !action.paused
    const activeClip = [...actionsRef.current.entries()].find(([, item]) => item === action)?.[0] || ''
    onAnimationStateChange?.({
      activeClip,
      playing: !action.paused,
      paused: action.paused,
      speed: mixerRef.current?.timeScale || animationSpeed,
    })
    return true
  }

  function setAnimationSpeed(speed) {
    const next = THREE.MathUtils.clamp(Number(speed) || 1, 0.1, 3)
    if (mixerRef.current) mixerRef.current.timeScale = next
    const action = activeActionRef.current
    const activeClip = [...actionsRef.current.entries()].find(([, item]) => item === action)?.[0] || ''
    onAnimationStateChange?.({ activeClip, playing: Boolean(action && !action.paused), paused: Boolean(action?.paused), speed: next })
    return true
  }

  function applyVariant(variantId) {
    if (!variantId) return resetObjectMaterials(rootRef.current) > 0
    const variant = (inspection.materialVariants || []).find((item) => item.id === variantId)
    if (!variant) return false
    return applyMaterialVariant(rootRef.current, variant)
  }

  function focusAnnotation(annotationId) {
    const annotation = (inspection.annotations || []).find((item) => item.id === annotationId)
    const controls = controlsRef.current
    if (!annotation || !rootRef.current || !controls) return false
    let world
    const anchor = annotation.anchorNode ? rootRef.current.getObjectByName?.(annotation.anchorNode) : null
    if (anchor && Array.isArray(annotation.anchorPosition)) {
      world = anchor.localToWorld(new THREE.Vector3(...annotation.anchorPosition))
    } else {
      const local = new THREE.Vector3(...(annotation.position || [0, 0.8, 0]))
      world = rootRef.current.localToWorld(local.clone())
    }
    controls.target.copy(world)
    const offset = camera.position.clone().sub(world)
    const length = Math.max(offset.length(), controls.minDistance * 1.2)
    camera.position.copy(world).add(offset.normalize().multiplyScalar(length))
    controls.update()
    onAnnotationSelect?.(annotation)
    return true
  }

  function resetView() {
    const controls = controlsRef.current
    const initial = initialCameraRef.current
    if (!controls || !initial) return false
    camera.position.copy(initial.position)
    controls.target.copy(initial.target)
    controls.update()
    return true
  }

  function zoom(factor) {
    const controls = controlsRef.current
    if (!controls) return false
    const offset = camera.position.clone().sub(controls.target)
    const nextDistance = THREE.MathUtils.clamp(
      offset.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    )
    camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(nextDistance))
    controls.update()
    return true
  }

  useImperativeHandle(ref, () => ({
    playAnimation,
    toggleAnimation,
    setAnimationSpeed,
    applyVariant,
    resetMaterials() { return resetObjectMaterials(rootRef.current) > 0 },
    showAnnotation: focusAnnotation,
    resetRotation: resetView,
    resetView,
    zoomIn() { return zoom(0.82) },
    zoomOut() { return zoom(1.22) },
  }))

  useFrame((_, delta) => {
    mixerRef.current?.update(delta)
    controlsRef.current?.update()
  })

  return (
    <>
      <hemisphereLight intensity={0.65} groundColor="#15191f" />
      <directionalLight
        position={[3.5, 5.5, 4]}
        intensity={2.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.1}
        shadow-camera-far={18}
      />
      <directionalLight position={[-3, 2.2, 1.5]} intensity={0.75} />

      {settings.showGround !== false && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]} receiveShadow>
          <planeGeometry args={[12, 12]} />
          <shadowMaterial
            transparent
            opacity={THREE.MathUtils.clamp(Number(settings.shadowIntensity ?? 0.24), 0, 0.8)}
          />
        </mesh>
      )}

      <group rotation={[0, THREE.MathUtils.degToRad(Number(inspection.rotationY) || 0), 0]}>
        {model && (
          <primitive
            object={model}
            onDoubleClick={(event) => {
              event.stopPropagation()
              if (!controlsRef.current) return
              controlsRef.current.target.copy(event.point)
              controlsRef.current.update()
            }}
          />
        )}

        {(inspection.annotations || []).map((annotation) => (
          <AnnotationMarker
            key={annotation.id}
            model={model}
            annotation={annotation}
            active={annotation.id === selectedAnnotationId}
            onSelect={focusAnnotation}
          />
        ))}
      </group>
    </>
  )
})

const ProductInspectorDesktop = forwardRef(function ProductInspectorDesktop({
  inspection,
  onClose,
  onAnimationsChange,
  onStatusChange,
}, ref) {
  const sceneRef = useRef(null)
  const [status, setStatus] = useState({ state: 'loading', progress: 0, error: '' })
  const [animations, setAnimations] = useState([])
  const [metadata, setMetadata] = useState(null)
  const [autoRotate, setAutoRotate] = useState(Boolean(inspection.viewer?.autoRotate))
  const [animationState, setAnimationState] = useState({ activeClip: '', playing: false, paused: false, speed: Number(inspection.viewer?.animationSpeed) || 1 })
  const [activeVariantId, setActiveVariantId] = useState('')
  const [selectedAnnotation, setSelectedAnnotation] = useState(null)
  const [showDetails, setShowDetails] = useState(false)

  const controls = useMemo(
    () => resolveAnimationControls(inspection, animations),
    [animations, inspection],
  )
  const variants = inspection.materialVariants || []
  const annotations = inspection.annotations || []
  const settings = inspection.viewer || {}
  const background = settings.background || '#0a0d12'

  const updateStatus = useCallback((next) => {
    setStatus(next)
    onStatusChange?.(next)
  }, [onStatusChange])

  const updateAnimations = useCallback((next) => {
    setAnimations(next)
    onAnimationsChange?.(next)
  }, [onAnimationsChange])

  useImperativeHandle(ref, () => ({
    playAnimation(name) { return sceneRef.current?.playAnimation(name) || false },
    toggleAnimation() { return sceneRef.current?.toggleAnimation() || false },
    setAnimationSpeed(speed) { return sceneRef.current?.setAnimationSpeed(speed) || false },
    async applyVariant(id) {
      const result = await sceneRef.current?.applyVariant(id)
      if (result !== false) setActiveVariantId(id || '')
      return result
    },
    resetMaterials() {
      setActiveVariantId('')
      return sceneRef.current?.resetMaterials() || false
    },
    showAnnotation(id) { return sceneRef.current?.showAnnotation(id) || false },
    resetRotation() { return sceneRef.current?.resetView() || false },
    resetView() { return sceneRef.current?.resetView() || false },
    zoomIn() { return sceneRef.current?.zoomIn() || false },
    zoomOut() { return sceneRef.current?.zoomOut() || false },
  }))

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.()
      if (event.key === '0') sceneRef.current?.resetView()
      if (event.key === '+' || event.key === '=') sceneRef.current?.zoomIn()
      if (event.key === '-') sceneRef.current?.zoomOut()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section className="product-workspace" aria-label="3D product inspection">
      <div className="product-workspace__stage" style={{ background }}>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [2.5, 1.55, 3.2], fov: 42, near: 0.01, far: 60 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <InspectorScene
            ref={sceneRef}
            inspection={inspection}
            autoRotate={autoRotate}
            selectedAnnotationId={selectedAnnotation?.id || ''}
            onAnimationsChange={updateAnimations}
            onStatusChange={updateStatus}
            onMetadataChange={setMetadata}
            onAnimationStateChange={setAnimationState}
            onAnnotationSelect={setSelectedAnnotation}
          />
        </Canvas>

        {status.state === 'loading' && (
          <div className="product-workspace__loading" role="status">
            <strong>Loading 3D model</strong>
            <div className="product-workspace__progress">
              <span style={{ width: `${Math.round((status.progress ?? 0.14) * 100)}%` }} />
            </div>
            <span>
              {status.total
                ? `${Math.round((status.loaded || 0) / 1024 / 1024)} MB / ${Math.round(status.total / 1024 / 1024)} MB`
                : 'Preparing model…'}
            </span>
          </div>
        )}

        {status.state === 'error' && (
          <div className="product-workspace__error" role="alert">
            <strong>Could not load this model</strong>
            <p>{status.error}</p>
          </div>
        )}

        {status.state === 'ready' && (
          <div className="product-workspace__hint">
            Drag to orbit · wheel/pinch to zoom · right-drag/two-finger to pan · double-click a surface to focus
          </div>
        )}

        <div className="product-workspace__view-controls" aria-label="Model view controls">
          <button type="button" onClick={() => sceneRef.current?.zoomIn()} aria-label="Zoom in">Zoom +</button>
          <button type="button" onClick={() => sceneRef.current?.zoomOut()} aria-label="Zoom out">Zoom −</button>
          <button type="button" onClick={() => sceneRef.current?.resetView()}>Fit model</button>
          <button
            type="button"
            className={autoRotate ? 'active' : ''}
            onClick={() => setAutoRotate((value) => !value)}
          >
            Auto rotate
          </button>
        </div>
      </div>

      <aside className="product-workspace__panel">
        <header className="product-workspace__header">
          <div>
            <div className="product-workspace__eyebrow">3D product</div>
            <h2>{inspection.title || 'Product'}</h2>
          </div>
          <button type="button" onClick={onClose}>Back</button>
        </header>

        {controls.length > 0 && (
          <section className="product-workspace__section">
            <div className="product-workspace__section-title">
              <strong>Movement</strong>
              {animationState.activeClip && (
                <span>{animationState.paused ? 'Paused' : animationState.playing ? 'Playing' : 'Ready'}</span>
              )}
            </div>
            <div className="product-workspace__choice-grid">
              {controls.map((control) => (
                <button
                  key={control.id}
                  type="button"
                  className={animationState.activeClip === control.clip ? 'selected' : ''}
                  onClick={() => sceneRef.current?.playAnimation(control.clip)}
                >
                  {control.label}
                </button>
              ))}
            </div>
            {animationState.activeClip && (
              <div className="product-workspace__animation-tools">
                <button type="button" onClick={() => sceneRef.current?.toggleAnimation()}>
                  {animationState.paused ? 'Resume' : 'Pause'}
                </button>
                <button type="button" onClick={() => sceneRef.current?.playAnimation(animationState.activeClip)}>Replay</button>
                <label>
                  Speed
                  <select
                    value={String(animationState.speed)}
                    onChange={(event) => sceneRef.current?.setAnimationSpeed(Number(event.target.value))}
                  >
                    <option value="0.5">0.5×</option>
                    <option value="0.75">0.75×</option>
                    <option value="1">1×</option>
                    <option value="1.5">1.5×</option>
                    <option value="2">2×</option>
                  </select>
                </label>
              </div>
            )}
          </section>
        )}

        {variants.length > 0 && (
          <section className="product-workspace__section">
            <div className="product-workspace__section-title"><strong>Finishes</strong></div>
            <div className="product-workspace__finish-grid">
              {variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  className={activeVariantId === variant.id ? 'selected' : ''}
                  onClick={async () => {
                    const ok = await sceneRef.current?.applyVariant(variant.id)
                    if (ok !== false) setActiveVariantId(variant.id)
                  }}
                >
                  <span
                    className="product-workspace__finish-swatch"
                    style={{
                      backgroundColor: variant.color || '#ffffff',
                      backgroundImage: variant.textureUrl ? `url(${variant.textureUrl})` : undefined,
                    }}
                  />
                  <span>{variant.label || 'Finish'}</span>
                </button>
              ))}
              <button
                type="button"
                className={!activeVariantId ? 'selected' : ''}
                onClick={() => {
                  sceneRef.current?.resetMaterials()
                  setActiveVariantId('')
                }}
              >
                <span className="product-workspace__finish-swatch product-workspace__finish-swatch--original" />
                <span>Original</span>
              </button>
            </div>
          </section>
        )}

        {annotations.length > 0 && (
          <section className="product-workspace__section">
            <div className="product-workspace__section-title"><strong>Details</strong></div>
            <div className="product-workspace__detail-list">
              {annotations.map((annotation) => (
                <button
                  key={annotation.id}
                  type="button"
                  className={selectedAnnotation?.id === annotation.id ? 'selected' : ''}
                  onClick={() => sceneRef.current?.showAnnotation(annotation.id)}
                >
                  <span>{annotation.label || 'Detail'}</span>
                  {annotation.body && <small>{annotation.body}</small>}
                </button>
              ))}
            </div>
          </section>
        )}

        {metadata && (
          <section className="product-workspace__section product-workspace__section--meta">
            <button type="button" className="product-workspace__details-toggle" onClick={() => setShowDetails((value) => !value)}>
              Model details {showDetails ? '−' : '+'}
            </button>
            {showDetails && (
              <dl className="product-workspace__metadata">
                <div><dt>Source dimensions</dt><dd>{metadata.sourceSize.map(formatDimension).join(' × ')}</dd></div>
                <div><dt>Meshes</dt><dd>{metadata.meshes}</dd></div>
                <div><dt>Materials</dt><dd>{metadata.materials}</dd></div>
                <div><dt>Animations</dt><dd>{animations.length}</dd></div>
              </dl>
            )}
          </section>
        )}
      </aside>
    </section>
  )
})

export default ProductInspectorDesktop
