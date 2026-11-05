import React, {
  forwardRef,
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import WorldButton from './WorldButton'
import WorldInfoPanel from './WorldInfoPanel'
import WorldLabel from './WorldLabel'
import { damp, wheelPixels } from '../../input/lookMotion'
import { worldAppearance } from '../../theme/worldAppearance'
import { normalizeInspectionModel, inspectionBounds, inspectionFitDistance, INSPECTION_VIEWS } from '../../product/modelPresentation'
import {
  applyMaterialVariant,
  resetObjectMaterials,
  resolveAnimationControls,
} from '../../product/productControls'

const PAGE_SIZE = 6
const SPEEDS = [0.5, 0.75, 1, 1.5, 2]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function cloneModelMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const cloned = materials.map((material) => material?.clone?.() || material)
    child.material = Array.isArray(child.material) ? cloned : cloned[0]
  })
}

function disposeModel(object) {
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

function createShadowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 120)
  gradient.addColorStop(0, 'rgba(0,0,0,0.52)')
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.24)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function pointerXY(event) {
  return {
    x: Number(event.clientX ?? event.nativeEvent?.clientX ?? 0),
    y: Number(event.clientY ?? event.nativeEvent?.clientY ?? 0),
  }
}

function activeCamera(camera, gl) {
  return gl.xr.isPresenting ? gl.xr.getCamera(camera) : camera
}

function captureAnchor(camera, gl, distance, keepLevel = false, fitControls = true) {
  const viewCamera = activeCamera(camera, gl)
  const direction = new THREE.Vector3()
  const position = new THREE.Vector3()
  viewCamera.getWorldPosition(position)
  viewCamera.getWorldDirection(direction)
  if (!keepLevel) {
    const orientation = viewCamera.getWorldQuaternion(new THREE.Quaternion())
    // Fit the full control grid at the current zoom and viewport aspect ratio.
    const vertical = Math.tan(THREE.MathUtils.degToRad(viewCamera.fov || 75) / 2)
    const horizontal = vertical * (viewCamera.aspect || 1)
    const fittedDistance = fitControls ? Math.max(distance, 0.9 + Math.max(1.95 / horizontal, 1.55 / vertical)) : distance
    position.add(new THREE.Vector3(0, -0.375, -fittedDistance).applyQuaternion(orientation))
    return { position: position.toArray(), rotation: new THREE.Euler().setFromQuaternion(orientation, 'YXZ').toArray() }
  }
  direction.y = 0
  if (direction.lengthSq() < 0.001) direction.set(0, 0, -1)
  direction.normalize()

  position
    .addScaledVector(direction, distance)
    .add(new THREE.Vector3(0, -0.72, 0))

  const yaw = Math.atan2(direction.x, direction.z)
  return {
    position: position.toArray(),
    rotation: [0, yaw + Math.PI, 0],
  }
}

function optionPosition(index) {
  return [-0.8 + (index % 3) * 0.8, -0.55 - Math.floor(index / 3) * 0.28, 0.86]
}

function tabPosition(index) {
  return [-0.96 + index * 0.64, -0.25, 0.86]
}

function AnimatedAnnotationButton({ model, annotation, onActivate, number }) {
  const { camera, gl } = useThree()
  const anchorRef = useRef(null)

  useFrame(() => {
    const anchor = anchorRef.current
    const rotationRoot = anchor?.parent
    if (!anchor || !rotationRoot) return

    let worldPoint = null
    const node = annotation.anchorNode ? model?.getObjectByName?.(annotation.anchorNode) : null
    if (node && Array.isArray(annotation.anchorPosition)) {
      worldPoint = node.localToWorld(new THREE.Vector3(...annotation.anchorPosition))
    } else {
      worldPoint = rotationRoot.localToWorld(new THREE.Vector3(...(annotation.position || [0, 0.8, 0])))
    }

    const local = rotationRoot.worldToLocal(worldPoint.clone())
    anchor.position.copy(local)

    const viewCamera = activeCamera(camera, gl)
    const cameraWorld = viewCamera.getWorldQuaternion(new THREE.Quaternion())
    const rootWorld = rotationRoot.getWorldQuaternion(new THREE.Quaternion()).invert()
    anchor.quaternion.copy(rootWorld.multiply(cameraWorld))
  })

  return (
    <group ref={anchorRef}>
      <WorldButton
        label={number ? String(number) : annotation.label || 'Detail'}
        position={[0, 0, 0]}
        width={number ? 0.13 : 0.58}
        marker={Boolean(number)}
        onActivate={onActivate}
      />
    </group>
  )
}

const ProductInspector3D = forwardRef(function ProductInspector3D({
  inspection,
  immersive = false,
  directManipulation = true,
  showControls = true,
  showAnnotations = true,
  standalone = false,
  inputHint,
  onClose,
  onAnimationsChange,
  onStatusChange,
  onControlsChange,
}, ref) {
  const { camera, gl, scene, size } = useThree()
  const modelRotation = useRef(null)
  const modelZoom = useRef(null)
  const mixerRef = useRef(null)
  const actionsRef = useRef(new Map())
  const activeActionRef = useRef(null)
  const modelRef = useRef(null)
  const finishRequest = useRef(null)
  const pointersRef = useRef(new Map())
  const pinchDistanceRef = useRef(null)
  const viewRef = useRef({
    yaw: THREE.MathUtils.degToRad(Number(inspection.rotationY) || 0),
    pitch: THREE.MathUtils.degToRad(Number(inspection.viewer?.startPitch) || 0),
    zoom: Number(inspection.viewer?.startZoom) || 1,
    panX: 0, panY: 0,
  })

  const settings = inspection.viewer || {}
  const anchorDistance = clamp(Number(settings.distance ?? 2.35), 1.5, 4)
  const minZoom = clamp(Number(settings.minZoom ?? 0.65), 0.3, 1.5)
  const maxZoom = clamp(Number(settings.maxZoom ?? 3), Math.max(minZoom + 0.1, 1), 4)
  const backdropOpacity = clamp(Number(settings.backdropOpacity ?? 0.10), 0, 0.45)
  const initialSpeed = Math.max(0.05, Number(settings.animationSpeed) || 1)

  const [anchorTransform, setAnchorTransform] = useState(() => captureAnchor(camera, gl, anchorDistance, immersive, showControls))
  const [model, setModel] = useState(null)
  const [bounds, setBounds] = useState(null)
  const [animations, setAnimations] = useState([])
  const [status, setStatus] = useState({ state: 'loading', progress: 0, error: '' })
  const [activeAnnotation, setActiveAnnotation] = useState(null)
  const [activeVariantId, setActiveVariantId] = useState('')
  const [finishStatus, setFinishStatus] = useState(null)
  const [activeTab, setActiveTab] = useState('view')
  const [page, setPage] = useState(0)
  const [autoRotate, setAutoRotate] = useState(Boolean(settings.autoRotate))
  const [animationState, setAnimationState] = useState({
    activeClip: '',
    paused: false,
    playing: false,
    speed: initialSpeed,
  })

  const shadowTexture = useMemo(() => createShadowTexture(), [])

  const notifyStatus = useEffectEvent((next) => onStatusChange?.(next))
  const notifyAnimations = useEffectEvent((names) => onAnimationsChange?.(names))
  const setStatusAndNotify = useCallback((next) => {
    setStatus(next)
    notifyStatus(next)
  }, [])

  const syncViewTransform = useCallback((delta = null) => {
    const rotation = modelRotation.current
    const zoomRoot = modelZoom.current
    if (rotation) {
      rotation.rotation.x = delta == null ? viewRef.current.pitch : damp(rotation.rotation.x, viewRef.current.pitch, delta, 22)
      rotation.rotation.y = delta == null ? viewRef.current.yaw : damp(rotation.rotation.y, viewRef.current.yaw, delta, 22)
    }
    if (zoomRoot) {
      zoomRoot.scale.setScalar(delta == null ? viewRef.current.zoom : damp(zoomRoot.scale.x, viewRef.current.zoom, delta))
      if (standalone) zoomRoot.position.set(viewRef.current.panX || 0, viewRef.current.panY || 0, 0)
    }
  }, [standalone])

  const resetView = useCallback(() => {
    viewRef.current = {
      yaw: THREE.MathUtils.degToRad(Number(inspection.rotationY) || 0),
      pitch: THREE.MathUtils.degToRad(Number(settings.startPitch) || 0),
      zoom: Number(settings.startZoom) || 1,
      panX: 0, panY: 0,
    }
    setAutoRotate(Boolean(settings.autoRotate))
    syncViewTransform()
    return true
  }, [inspection.rotationY, settings.startPitch, settings.startZoom, settings.autoRotate, syncViewTransform])

  const adjustZoom = useCallback((factor) => {
    viewRef.current.zoom = clamp(viewRef.current.zoom * factor, minZoom, maxZoom)
    return true
  }, [maxZoom, minZoom])

  const rotateBy = useCallback((yaw, pitch = 0) => {
    viewRef.current.yaw += yaw
    const limit = settings.orbitMode === 'turntable' ? 0 : Math.PI * 0.495
    viewRef.current.pitch = clamp(viewRef.current.pitch + pitch, -limit, limit)
    return true
  }, [settings.orbitMode])

  const fitView = useCallback(() => {
    viewRef.current.zoom = 1
    viewRef.current.panX = 0
    viewRef.current.panY = 0
    return true
  }, [])

  const setView = useCallback((name) => {
    const angles = INSPECTION_VIEWS[name]
    if (!angles) return false
    viewRef.current.yaw = THREE.MathUtils.degToRad(angles[0])
    viewRef.current.pitch = THREE.MathUtils.degToRad(angles[1])
    setAutoRotate(false)
    fitView()
    return true
  }, [fitView])

  const recenter = useCallback(() => {
    setAnchorTransform(captureAnchor(camera, gl, anchorDistance, immersive, showControls))
    return true
  }, [anchorDistance, camera, gl, immersive, showControls])

  const resetMaterials = useCallback(() => {
    finishRequest.current = null
    resetObjectMaterials(modelRef.current)
    setActiveVariantId('')
    setFinishStatus(null)
    return true
  }, [])

  const applyVariant = useCallback(async (variantId) => {
    if (!variantId) return resetMaterials()
    const variant = (inspection.materialVariants || []).find((item) => item.id === variantId)
    const request = {}
    finishRequest.current = request
    setFinishStatus({ loading: true, message: 'Applying finish…' })
    const ok = await applyMaterialVariant(modelRef.current, variant)
    if (finishRequest.current !== request) return false
    if (ok) setActiveVariantId(variantId)
    setFinishStatus(ok ? null : { loading: false, message: 'Couldn’t apply this finish. The previous finish is still active.' })
    return ok
  }, [inspection.materialVariants, resetMaterials])

  const playAnimation = useCallback((name) => {
    const action = actionsRef.current.get(name)
    if (!action) return false

    const previous = activeActionRef.current
    if (previous && previous !== action) previous.fadeOut(0.20)

    action.reset()
    action.enabled = true
    action.paused = false
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.fadeIn(0.20)
    action.play()
    activeActionRef.current = action
    setAnimationState((current) => ({
      ...current,
      activeClip: name,
      paused: false,
      playing: true,
    }))
    return true
  }, [])

  const toggleAnimation = useCallback(() => {
    const action = activeActionRef.current
    if (!action) return false
    action.paused = !action.paused
    setAnimationState((current) => ({
      ...current,
      paused: action.paused,
      playing: !action.paused,
    }))
    return true
  }, [])

  const setAnimationSpeed = useCallback((speed) => {
    const next = clamp(Number(speed) || 1, 0.1, 3)
    if (mixerRef.current) mixerRef.current.timeScale = next
    setAnimationState((current) => ({ ...current, speed: next }))
    return true
  }, [])

  const cycleAnimationSpeed = useCallback(() => {
    const currentIndex = SPEEDS.findIndex((value) => Math.abs(value - animationState.speed) < 0.001)
    const next = SPEEDS[(currentIndex + 1 + SPEEDS.length) % SPEEDS.length]
    return setAnimationSpeed(next)
  }, [animationState.speed, setAnimationSpeed])

  useEffect(() => {
    viewRef.current = {
      yaw: THREE.MathUtils.degToRad(Number(inspection.rotationY) || 0),
      pitch: THREE.MathUtils.degToRad(Number(settings.startPitch) || 0),
      zoom: Number(settings.startZoom) || 1,
      panX: 0, panY: 0,
    }
    setAnchorTransform(captureAnchor(camera, gl, anchorDistance, immersive, showControls))
    setActiveAnnotation(null)
    setActiveVariantId('')
    setFinishStatus(null)
    setPage(0)
    setAutoRotate(Boolean(settings.autoRotate))
    syncViewTransform()
  }, [anchorDistance, camera, gl, immersive, inspection.id, inspection.rotationY, settings.startPitch, settings.startZoom, settings.autoRotate, showControls, syncViewTransform])

  useEffect(() => {
    if (!standalone || !bounds) return
    const distance = inspectionFitDistance(bounds.radius, camera.fov, size.width / Math.max(1, size.height))
    camera.position.set(0, 0, distance)
    camera.near = Math.max(0.001, bounds.radius / 100)
    camera.far = Math.max(100, distance + bounds.radius * 20)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [bounds, camera, size.width, size.height, standalone])

  useEffect(() => {
    const previousEnvironment = scene.environment
    const previousEnvironmentIntensity = scene.environmentIntensity
    const previousToneMapping = gl.toneMapping
    const previousExposure = gl.toneMappingExposure

    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = pmrem.fromScene(room, 0.04)
    room.dispose()

    scene.environment = target.texture
    scene.environmentIntensity = clamp(Number(settings.environmentIntensity ?? 1), 0, 4)
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = clamp(Number(settings.exposure ?? 1), 0.1, 3)

    return () => {
      if (scene.environment === target.texture) scene.environment = previousEnvironment
      scene.environmentIntensity = previousEnvironmentIntensity
      gl.toneMapping = previousToneMapping
      gl.toneMappingExposure = previousExposure
      target.dispose()
      pmrem.dispose()
    }
  }, [gl, scene, settings.environmentIntensity, settings.exposure])

  useEffect(() => {
    let disposed = false
    let loadedScene = null
    let mixer = null

    setModel(null)
    setBounds(null)
    setAnimations([])
    modelRef.current = null
    actionsRef.current.clear()
    activeActionRef.current = null
    notifyAnimations([])
    setAnimationState({ activeClip: '', paused: false, playing: false, speed: initialSpeed })
    setStatusAndNotify({ state: 'loading', progress: 0, loaded: 0, total: 0, error: '' })

    if (!inspection.modelUrl) {
      setStatusAndNotify({
        state: 'error',
        progress: 0,
        error: 'This inspection action has no GLB model URL.',
      })
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

        try {
          loadedScene = normalizeInspectionModel(cloneSkeleton(gltf.scene), inspection.modelScale, settings.upAxis)
        } catch (error) {
          setStatusAndNotify({ state: 'error', progress: 0, error: error.message })
          return
        }
        cloneModelMaterials(loadedScene)
        setBounds(inspectionBounds(loadedScene))

        loadedScene.traverse((child) => {
          if (!child.isMesh) return
          child.castShadow = false
          child.receiveShadow = false
          child.frustumCulled = true
        })

        mixer = new THREE.AnimationMixer(loadedScene.children[0].children[0])
        mixer.timeScale = initialSpeed
        mixer.addEventListener('finished', () => {
          setAnimationState((current) => ({ ...current, playing: false, paused: false }))
        })
        mixerRef.current = mixer
        actionsRef.current = new Map(
          (gltf.animations || []).map((clip) => [clip.name, mixer.clipAction(clip)]),
        )

        const names = (gltf.animations || []).map((clip) => clip.name).filter(Boolean)
        setAnimations(names)
        notifyAnimations(names)
        modelRef.current = loadedScene
        setModel(loadedScene)
        window.setTimeout(syncViewTransform, 0)
        setStatusAndNotify({ state: 'ready', progress: 1, loaded: 1, total: 1, error: '' })
      },
      (event) => {
        if (disposed) return
        const loaded = Number(event.loaded) || 0
        const total = Number(event.total) || 0
        const progress = total > 0 ? clamp(loaded / total, 0, 0.98) : 0.15
        setStatusAndNotify({ state: 'loading', progress, loaded, total, error: '' })
      },
      (error) => {
        if (disposed) return
        console.error('[product-inspector] GLB load failed', error)
        setStatusAndNotify({
          state: 'error',
          progress: 0,
          error: 'Could not open this model. Check the model URL or replace the GLB in the editor.',
        })
      },
    )

    return () => {
      disposed = true
      mixer?.stopAllAction()
      mixerRef.current = null
      actionsRef.current.clear()
      activeActionRef.current = null
      modelRef.current = null
      finishRequest.current = null
      resetObjectMaterials(loadedScene)
      disposeModel(loadedScene)
      dracoLoader.dispose()
      ktx2Loader.dispose()
    }
  }, [gl, initialSpeed, inspection.modelScale, inspection.modelUrl, settings.upAxis, setStatusAndNotify, syncViewTransform])

  useEffect(() => () => shadowTexture.dispose(), [shadowTexture])

  useImperativeHandle(ref, () => ({
    playAnimation,
    toggleAnimation,
    setAnimationSpeed,
    applyVariant,
    resetMaterials,
    showAnnotation(annotationId) {
      const annotation = (inspection.annotations || []).find((item) => item.id === annotationId)
      if (!annotation) return false
      setActiveAnnotation(annotation)
      setActiveTab('details')
      return true
    },
    resetRotation: resetView,
    resetView,
    fitView,
    setView,
    getView() {
      return { rotationY: Number(THREE.MathUtils.radToDeg(viewRef.current.yaw).toFixed(1)), startPitch: Number(THREE.MathUtils.radToDeg(viewRef.current.pitch).toFixed(1)), startZoom: Number(viewRef.current.zoom.toFixed(2)) }
    },
    zoomIn() { return adjustZoom(1.12) },
    zoomOut() { return adjustZoom(0.89) },
    rotateLeft() { return rotateBy(-THREE.MathUtils.degToRad(15)) },
    rotateRight() { return rotateBy(THREE.MathUtils.degToRad(15)) },
    recenter,
  }), [
    adjustZoom,
    applyVariant,
    inspection.annotations,
    playAnimation,
    recenter,
    resetMaterials,
    resetView,
    fitView,
    setView,
    rotateBy,
    setAnimationSpeed,
    toggleAnimation,
  ])

  useFrame((_, delta) => {
    mixerRef.current?.update(delta)
    if (autoRotate && pointersRef.current.size === 0) {
      viewRef.current.yaw += delta * (Number(settings.autoRotateSpeed) || 0.65) * 0.42
    }
    syncViewTransform(delta)
  })

  const animationButtons = useMemo(
    () => resolveAnimationControls(inspection, animations),
    [animations, inspection],
  )
  const materialVariants = inspection.materialVariants || []
  const annotations = inspection.annotations || []

  const tabs = useMemo(() => {
    const result = []
    if (animationButtons.length > 0) result.push({ id: 'motion', label: 'Motion' })
    if (materialVariants.length > 0) result.push({ id: 'finishes', label: 'Finishes' })
    if (annotations.length > 0) result.push({ id: 'details', label: 'Details' })
    result.push({ id: 'view', label: 'View' })
    return result
  }, [animationButtons.length, annotations.length, materialVariants.length])

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id || 'view')
    }
    setPage(0)
  }, [activeTab, tabs])

  const options = useMemo(() => {
    if (activeTab === 'motion') {
      const result = animationButtons.map((control) => ({
        id: `motion:${control.id}`,
        label: control.label,
        selected: animationState.activeClip === control.clip,
        activate: () => playAnimation(control.clip),
      }))

      if (animationState.activeClip) {
        if (animationState.playing || animationState.paused) result.push({
          id: 'motion:toggle',
          label: animationState.paused ? 'Resume' : 'Pause',
          activate: toggleAnimation,
        })
        result.push({
          id: 'motion:replay',
          label: 'Replay',
          activate: () => playAnimation(animationState.activeClip),
        })
        result.push({
          id: 'motion:speed',
          label: `Speed ${animationState.speed}×`,
          activate: cycleAnimationSpeed,
        })
      }
      return result
    }

    if (activeTab === 'finishes') {
      return [
        ...materialVariants.map((variant) => ({
          id: `finish:${variant.id}`,
          label: variant.label || 'Finish',
          selected: activeVariantId === variant.id,
          activate: () => applyVariant(variant.id),
        })),
        {
          id: 'finish:original',
          label: 'Original',
          selected: !activeVariantId,
          activate: resetMaterials,
        },
      ]
    }

    if (activeTab === 'details') {
      return annotations.map((annotation) => ({
        id: `detail:${annotation.id}`,
        label: annotation.label || 'Detail',
        selected: activeAnnotation?.id === annotation.id,
        activate: () => setActiveAnnotation(annotation),
      }))
    }

    return [
      ...(standalone ? [
        { id: 'view:fit', label: 'Fit model', activate: fitView },
        { id: 'view:front', label: 'Front', activate: () => setView('front') },
        { id: 'view:back', label: 'Back', activate: () => setView('back') },
        ...(settings.orbitMode !== 'turntable' ? [{ id: 'view:top', label: 'Top', activate: () => setView('top') }] : []),
        { id: 'view:angle', label: '3D angle', activate: () => setView('angle') },
      ] : []),
      { id: 'view:left', label: 'Rotate left', activate: () => rotateBy(-THREE.MathUtils.degToRad(15)) },
      { id: 'view:right', label: 'Rotate right', activate: () => rotateBy(THREE.MathUtils.degToRad(15)) },
      { id: 'view:closer', label: 'Closer', activate: () => adjustZoom(1.12) },
      { id: 'view:further', label: 'Further', activate: () => adjustZoom(0.89) },
      { id: 'view:reset', label: 'Reset view', activate: resetView },
      ...(!standalone ? [{ id: 'view:recenter', label: 'Recenter', activate: recenter }] : []),
      {
        id: 'view:auto',
        label: autoRotate ? 'Stop rotation' : 'Auto rotate',
        selected: autoRotate,
        activate: () => setAutoRotate((value) => !value),
      },
    ]
  }, [
    activeAnnotation?.id,
    activeTab,
    activeVariantId,
    adjustZoom,
    animationButtons,
    animationState.activeClip,
    animationState.paused,
    animationState.playing,
    animationState.speed,
    annotations,
    applyVariant,
    autoRotate,
    cycleAnimationSpeed,
    materialVariants,
    playAnimation,
    recenter,
    resetMaterials,
    resetView,
    rotateBy,
    toggleAnimation,
    standalone, fitView, setView, settings.orbitMode,
  ])

  const notifyControls = useEffectEvent((next) => onControlsChange?.(next))
  useEffect(() => {
    notifyControls({ status, tabs, activeTab, selectTab: setActiveTab, options, activeAnnotation,
      closeAnnotation: () => setActiveAnnotation(null), finishStatus, animationState, autoRotate })
  }, [status, tabs, activeTab, options, activeAnnotation, finishStatus, animationState, autoRotate])

  // Bind to the whole stage so dragging and pinching also work beside a thin model.
  const stageInput = useEffectEvent((type, event) => {
    if (type === 'down') {
      if (event.pointerType !== 'touch' && ![0, 1, 2].includes(event.button)) return
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      pinchDistanceRef.current = null
      gl.domElement.setPointerCapture?.(event.pointerId)
      setAutoRotate(false)
    } else if (type === 'move' && pointersRef.current.has(event.pointerId)) {
      const before = pointersRef.current.get(event.pointerId)
      const next = { x: event.clientX, y: event.clientY }
      const other = [...pointersRef.current.entries()].find(([id]) => id !== event.pointerId)?.[1]
      if (other) {
        const oldDistance = Math.hypot(before.x - other.x, before.y - other.y)
        const newDistance = Math.hypot(next.x - other.x, next.y - other.y)
        if (oldDistance > 8) adjustZoom(newDistance / oldDistance)
      }
      const panning = settings.allowPan !== false && (other || event.shiftKey || event.buttons === 2 || event.buttons === 4)
      if (panning) {
        const unit = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, size.height)
        const limit = Math.max(0.5, bounds?.radius || 1) * 3
        viewRef.current.panX = clamp((viewRef.current.panX || 0) + (next.x - before.x) * unit * (other ? 0.5 : 1), -limit, limit)
        viewRef.current.panY = clamp((viewRef.current.panY || 0) - (next.y - before.y) * unit * (other ? 0.5 : 1), -limit, limit)
      } else if (!other) rotateBy((next.x - before.x) * 0.008, (next.y - before.y) * 0.008)
      pointersRef.current.set(event.pointerId, next)
    } else if (type === 'end') {
      pointersRef.current.delete(event.pointerId)
      try { gl.domElement.releasePointerCapture?.(event.pointerId) } catch { /* pointer already released */ }
    } else if (type === 'wheel') {
      event.preventDefault()
      setAutoRotate(false)
      adjustZoom(Math.exp(-wheelPixels(event, size.height) * 0.0015))
    }
  })
  useEffect(() => {
    if (!standalone || !directManipulation) return
    const stage = gl.domElement
    const down = (event) => stageInput('down', event)
    const move = (event) => stageInput('move', event)
    const end = (event) => stageInput('end', event)
    const wheel = (event) => stageInput('wheel', event)
    const context = (event) => event.preventDefault()
    stage.addEventListener('pointerdown', down)
    stage.addEventListener('pointermove', move)
    stage.addEventListener('pointerup', end)
    stage.addEventListener('pointercancel', end)
    stage.addEventListener('lostpointercapture', end)
    stage.addEventListener('wheel', wheel, { passive: false })
    stage.addEventListener('contextmenu', context)
    return () => {
      stage.removeEventListener('pointerdown', down)
      stage.removeEventListener('pointermove', move)
      stage.removeEventListener('pointerup', end)
      stage.removeEventListener('pointercancel', end)
      stage.removeEventListener('lostpointercapture', end)
      stage.removeEventListener('wheel', wheel)
      stage.removeEventListener('contextmenu', context)
      pointersRef.current.clear()
    }
  }, [directManipulation, gl, standalone])

  const maxPage = Math.max(0, Math.ceil(options.length / PAGE_SIZE) - 1)
  const safePage = Math.min(page, maxPage)
  const visibleOptions = options.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const buttonWidth = 0.74

  function pointerDown(event) {
    if (!directManipulation || (event.pointerType !== 'touch' && event.button !== 0)) return
    event.stopPropagation()
    const point = pointerXY(event)
    pointersRef.current.set(event.pointerId, point)
    try { event.target?.setPointerCapture?.(event.pointerId) } catch { /* optional */ }

    if (pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()]
      pinchDistanceRef.current = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }

  function pointerMove(event) {
    if (!directManipulation || !pointersRef.current.has(event.pointerId)) return
    event.stopPropagation()

    const before = pointersRef.current.get(event.pointerId)
    const next = pointerXY(event)
    pointersRef.current.set(event.pointerId, next)

    if (pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinchDistanceRef.current && distance > 0) {
        adjustZoom(distance / pinchDistanceRef.current)
      }
      pinchDistanceRef.current = distance
      return
    }

    setAutoRotate(false)
    rotateBy((next.x - before.x) * 0.008, (next.y - before.y) * 0.005)
  }

  function pointerEnd(event) {
    if (!directManipulation) return
    pointersRef.current.delete(event.pointerId)
    pinchDistanceRef.current = null
    try { event.target?.releasePointerCapture?.(event.pointerId) } catch { /* optional */ }
  }

  const hint = inputHint || (immersive || !directManipulation
    ? 'Look at a control and hold the crosshair, or point and select with a controller.'
    : 'Drag to rotate. Scroll to zoom.')

  return (
    <>
      <group
        position={standalone ? [0, 0, 0] : anchorTransform.position}
        rotation={standalone ? [0, 0, 0] : anchorTransform.rotation}
        renderOrder={20}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[1.8, 2.8, 2.2]} intensity={2.5} />
        <directionalLight position={[-1.8, 1.2, 1.4]} intensity={0.9} />

        {!standalone && backdropOpacity > 0 && (
          <mesh position={[0, 0.20, -0.62]} renderOrder={8}>
            <planeGeometry args={[3.65, 2.85]} />
            <meshBasicMaterial
              color={worldAppearance()['marker-outline']}
              transparent
              opacity={backdropOpacity}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        )}

        {settings.showGround !== false && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, standalone ? -(bounds?.size[1] || 1.45) / 2 - 0.015 : immersive ? 0.045 : -0.335, 0]} renderOrder={9}>
            <planeGeometry args={[2.3, 2.3]} />
            <meshBasicMaterial
              map={shadowTexture}
              transparent
              opacity={clamp(Number(settings.shadowIntensity ?? 0.24) * 1.6, 0, 0.7)}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        )}

        {showControls && <>
        <WorldLabel
          title={inspection.title || 'Product'}
          position={[-0.2, 1.82, 0.83]}
          width={1.55}
        />
        {status.state !== 'ready' || finishStatus ? <WorldLabel
          title={finishStatus
            ? finishStatus.loading ? 'Applying finish' : 'Finish unavailable'
            : status.state === 'loading'
            ? `Loading ${Math.round((status.progress || 0) * 100)}%`
            : status.state === 'error'
              ? 'Model unavailable'
              : 'Explore the product'}
          detail={status.state === 'error' ? status.error : finishStatus?.message || hint}
          position={[0, 1.52, 0.82]}
          width={1.55}
          tone={status.state === 'error' || (finishStatus && !finishStatus.loading) ? 'error' : 'quiet'}
        /> : null}
        <WorldButton
          label="Back"
          position={[1.02, 1.82, 0.87]}
          width={0.50}
          tone="danger"
          onActivate={onClose}
        />
        </>}

        <group
          ref={modelZoom}
          position={[0, standalone ? 0 : immersive ? 0.08 : -0.3, 0]}
          onPointerDown={directManipulation && !standalone ? pointerDown : undefined}
          onPointerMove={directManipulation && !standalone ? pointerMove : undefined}
          onPointerUp={directManipulation && !standalone ? pointerEnd : undefined}
          onPointerCancel={directManipulation && !standalone ? pointerEnd : undefined}
          onWheel={directManipulation && !standalone ? (event) => {
            event.stopPropagation()
            setAutoRotate(false)
            adjustZoom(Math.exp(-wheelPixels(event, gl.domElement.clientHeight) * 0.0015))
          } : undefined}
        >
          <group
            ref={modelRotation}
            rotation={[0, THREE.MathUtils.degToRad(Number(inspection.rotationY) || 0), 0]}
          >
            <group position={standalone ? [0, -(bounds?.size[1] || 0) / 2, 0] : [0, 0, 0]}>
            {model && <primitive object={model} />}

            {showAnnotations && annotations.map((annotation, index) => (
              <AnimatedAnnotationButton
                key={annotation.id}
                model={model}
                annotation={annotation}
                number={standalone ? index + 1 : undefined}
                onActivate={() => {
                  setActiveAnnotation(annotation)
                  setActiveTab('details')
                }}
              />
            ))}
            </group>
          </group>
        </group>

        {showControls && status.state === 'ready' && tabs.map((tab, index) => (
          <WorldButton
            key={tab.id}
            label={tab.label}
            position={tabPosition(index)}
            width={0.60}
            selected={activeTab === tab.id}
            onActivate={() => {
              setActiveTab(tab.id)
              setPage(0)
            }}
          />
        ))}

        {showControls && status.state === 'ready' && visibleOptions.map((option, index) => (
          <WorldButton
            key={option.id}
            label={option.label}
            position={optionPosition(index)}
            width={buttonWidth}
            selected={Boolean(option.selected)}
            onActivate={option.activate}
          />
        ))}

        {showControls && status.state === 'ready' && maxPage > 0 && (
          <>
            <WorldButton
              label="Previous"
              position={[-0.35, -1.14, 0.86]}
              width={0.52}
              disabled={safePage <= 0}
              onActivate={() => setPage((value) => Math.max(0, value - 1))}
            />
            <WorldButton
              label="Next"
              position={[0.35, -1.14, 0.86]}
              width={0.52}
              disabled={safePage >= maxPage}
              onActivate={() => setPage((value) => Math.min(maxPage, value + 1))}
            />
          </>
        )}
      </group>

      {showControls && activeAnnotation && (
        <WorldInfoPanel
          info={{
            title: activeAnnotation.label || 'Detail',
            body: activeAnnotation.body || '',
          }}
          onClose={() => setActiveAnnotation(null)}
        />
      )}
    </>
  )
})

export default ProductInspector3D
