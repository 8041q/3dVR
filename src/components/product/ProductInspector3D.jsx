import React, {
  forwardRef,
  useEffect,
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
import WorldButton from './WorldButton'
import WorldInfoPanel from './WorldInfoPanel'
import {
  applyMaterialVariant,
  resetObjectMaterialColors,
  resolveAnimationControls,
} from '../../product/productControls'

const MODEL_TARGET_SIZE = 1.45

function normalizeModel(object, requestedScale = 1) {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z, 0.0001)
  const fit = (MODEL_TARGET_SIZE / maxDimension) * Math.max(0.01, Number(requestedScale) || 1)

  object.position.sub(center)
  object.scale.setScalar(fit)
  object.updateMatrixWorld(true)

  const fittedBox = new THREE.Box3().setFromObject(object)
  const fittedCenter = fittedBox.getCenter(new THREE.Vector3())
  object.position.x -= fittedCenter.x
  object.position.z -= fittedCenter.z
  object.position.y -= fittedBox.min.y

  return object
}

function cloneModelMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh) return

    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const cloned = materials.map((material) => {
      const next = material?.clone?.() || material
      if (next?.color) next.userData.__3dvrBaseColor = next.color.clone()
      return next
    })

    child.material = Array.isArray(child.material) ? cloned : cloned[0]
  })
}

function buttonGridPosition(index, count, y, maxColumns = 4, width = 0.7) {
  const columns = Math.min(maxColumns, count)
  const row = Math.floor(index / columns)
  const column = index % columns
  const rowCount = Math.min(columns, count - row * columns)
  return [
    (column - (rowCount - 1) / 2) * width,
    y - row * 0.32,
    0.82,
  ]
}

const ProductInspector3D = forwardRef(function ProductInspector3D({
  inspection,
  onClose,
  onAnimationsChange,
  onStatusChange,
}, ref) {
  const { camera } = useThree()
  const modelRotation = useRef()
  const mixerRef = useRef(null)
  const actionsRef = useRef(new Map())
  const modelRef = useRef(null)
  const dragging = useRef({ active: false, x: 0, pointerId: null })
  const [model, setModel] = useState(null)
  const [animations, setAnimations] = useState([])
  const [activeAnnotation, setActiveAnnotation] = useState(null)

  const anchorTransform = useMemo(() => {
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    direction.y = 0
    if (direction.lengthSq() < 0.001) direction.set(0, 0, -1)
    direction.normalize()

    const position = camera.position.clone()
      .addScaledVector(direction, 2.35)
      .add(new THREE.Vector3(0, -0.72, 0))
    const yaw = Math.atan2(direction.x, direction.z)

    return {
      position: position.toArray(),
      rotation: [0, yaw + Math.PI, 0],
    }
  }, [camera, inspection.id])

  function resetMaterials() {
    resetObjectMaterialColors(modelRef.current)
    return true
  }

  function applyVariant(variantId) {
    if (!variantId) {
      resetMaterials()
      return true
    }

    const variant = (inspection.materialVariants || []).find((item) => item.id === variantId)
    if (!variant) return false
    return applyMaterialVariant(modelRef.current, variant)
  }

  function playAnimation(name) {
    const action = actionsRef.current.get(name)
    if (!action) return false

    for (const other of actionsRef.current.values()) {
      if (other !== action) other.fadeOut(0.12)
    }

    action.reset()
    action.enabled = true
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.fadeIn(0.12)
    action.play()
    return true
  }

  useEffect(() => {
    let disposed = false
    let loadedScene = null
    let mixer = null

    setModel(null)
    setAnimations([])
    setActiveAnnotation(null)
    modelRef.current = null
    actionsRef.current.clear()
    onAnimationsChange?.([])
    onStatusChange?.({ state: 'loading', error: '' })

    if (!inspection.modelUrl) {
      onStatusChange?.({ state: 'error', error: 'This inspection action has no GLB model URL.' })
      return undefined
    }

    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)

    loader.load(
      inspection.modelUrl,
      (gltf) => {
        if (disposed) return

        loadedScene = cloneSkeleton(gltf.scene)
        cloneModelMaterials(loadedScene)
        normalizeModel(loadedScene, inspection.modelScale)

        loadedScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false
            child.receiveShadow = false
            child.frustumCulled = true
          }
        })

        mixer = new THREE.AnimationMixer(loadedScene)
        mixerRef.current = mixer
        actionsRef.current = new Map(
          (gltf.animations || []).map((clip) => [clip.name, mixer.clipAction(clip)])
        )

        const names = (gltf.animations || []).map((clip) => clip.name).filter(Boolean)
        setAnimations(names)
        onAnimationsChange?.(names)
        modelRef.current = loadedScene
        setModel(loadedScene)
        onStatusChange?.({ state: 'ready', error: '' })
      },
      undefined,
      (error) => {
        if (disposed) return
        console.error('[product-inspector] GLB load failed', error)
        onStatusChange?.({
          state: 'error',
          error: error?.message || 'Could not load the GLB model.',
        })
      },
    )

    return () => {
      disposed = true
      if (mixer) mixer.stopAllAction()
      mixerRef.current = null
      actionsRef.current.clear()
      modelRef.current = null
      loadedScene?.traverse((child) => {
        if (!child.isMesh) return
        child.geometry?.dispose?.()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) {
          if (!material) continue
          for (const value of Object.values(material)) {
            if (value?.isTexture) value.dispose()
          }
          material.dispose?.()
        }
      })
    }
  }, [inspection.modelUrl, inspection.modelScale, onAnimationsChange, onStatusChange])

  useImperativeHandle(ref, () => ({
    playAnimation,
    applyVariant,
    resetMaterials,
    showAnnotation(annotationId) {
      const annotation = (inspection.annotations || []).find((item) => item.id === annotationId)
      if (!annotation) return false
      setActiveAnnotation(annotation)
      return true
    },
    resetRotation() {
      if (modelRotation.current) {
        modelRotation.current.rotation.y = THREE.MathUtils.degToRad(Number(inspection.rotationY) || 0)
      }
    },
  }))

  useFrame((_, delta) => {
    mixerRef.current?.update(delta)
  })

  const animationButtons = resolveAnimationControls(inspection, animations).slice(0, 8)
  const materialVariants = (inspection.materialVariants || []).slice(0, 8)
  const annotations = (inspection.annotations || []).slice(0, 10)

  return (
    <>
      <group
        position={anchorTransform.position}
        rotation={anchorTransform.rotation}
        renderOrder={20}
      >
        <ambientLight intensity={2.2} />
        <directionalLight position={[1.5, 2.6, 2]} intensity={3.2} />
        <directionalLight position={[-1.5, 1.2, 1]} intensity={1.2} />

        <mesh position={[0, 0.85, -0.7]} renderOrder={10}>
          <planeGeometry args={[3.9, 3.35]} />
          <meshBasicMaterial
            color="#06090f"
            transparent
            opacity={0.76}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        <group
          ref={modelRotation}
          position={[0, 0.08, 0]}
          rotation={[0, THREE.MathUtils.degToRad(Number(inspection.rotationY) || 0), 0]}
          onPointerDown={(event) => {
            event.stopPropagation()
            dragging.current = { active: true, x: event.clientX, pointerId: event.pointerId }
            event.target?.setPointerCapture?.(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (!dragging.current.active || !modelRotation.current) return
            const dx = event.clientX - dragging.current.x
            dragging.current.x = event.clientX
            modelRotation.current.rotation.y += dx * 0.008
          }}
          onPointerUp={(event) => {
            dragging.current.active = false
            event.target?.releasePointerCapture?.(dragging.current.pointerId)
          }}
        >
          {model && <primitive object={model} />}

          {annotations.map((annotation) => (
            <WorldButton
              key={annotation.id}
              label={annotation.label || 'Detail'}
              position={Array.isArray(annotation.position) ? annotation.position : [0, 0.8, 0]}
              width={0.58}
              onActivate={() => setActiveAnnotation(annotation)}
            />
          ))}
        </group>

        {animationButtons.map((control, index) => (
          <WorldButton
            key={control.id}
            label={control.label}
            position={buttonGridPosition(index, animationButtons.length, -0.34)}
            width={0.66}
            onActivate={() => playAnimation(control.clip)}
          />
        ))}

        {materialVariants.map((variant, index) => (
          <WorldButton
            key={variant.id}
            label={variant.label || 'Variant'}
            position={buttonGridPosition(index, materialVariants.length, -1.05)}
            width={0.66}
            onActivate={() => applyVariant(variant.id)}
          />
        ))}

        <WorldButton
          label="Back"
          position={[0, -1.78, 0.82]}
          width={0.9}
          onActivate={onClose}
        />
      </group>

      {activeAnnotation && (
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
