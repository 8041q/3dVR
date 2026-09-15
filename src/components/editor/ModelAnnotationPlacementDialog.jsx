import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

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
  object.updateMatrixWorld(true)

  return object
}

function AnnotationModel({ modelUrl, modelScale, initialPosition, onPick, onStatus }) {
  const rootRef = useRef(null)
  const dragRef = useRef({ active: false, pointerId: null, x: 0, distance: 0 })
  const [model, setModel] = useState(null)
  const [marker, setMarker] = useState(initialPosition || null)

  useEffect(() => {
    setMarker(initialPosition || null)
  }, [initialPosition])

  useEffect(() => {
    let disposed = false
    let loadedScene = null

    setModel(null)
    onStatus?.({ state: 'loading', error: '' })

    if (!modelUrl) {
      onStatus?.({ state: 'error', error: 'Add or upload a GLB model first.' })
      return undefined
    }

    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)

    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return
        loadedScene = cloneSkeleton(gltf.scene)
        normalizeModel(loadedScene, modelScale)
        loadedScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false
            child.receiveShadow = false
          }
        })
        setModel(loadedScene)
        onStatus?.({ state: 'ready', error: '' })
      },
      undefined,
      (error) => {
        if (disposed) return
        onStatus?.({ state: 'error', error: error?.message || 'Could not load the GLB model.' })
      },
    )

    return () => {
      disposed = true
      loadedScene?.traverse((child) => {
        if (!child.isMesh) return
        child.geometry?.dispose?.()
      })
    }
  }, [modelScale, modelUrl, onStatus])

  function beginDrag(event) {
    event.stopPropagation()
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      x: event.clientX,
      distance: 0,
    }
    event.target?.setPointerCapture?.(event.pointerId)
  }

  function moveDrag(event) {
    if (!dragRef.current.active || !rootRef.current) return
    const dx = event.clientX - dragRef.current.x
    dragRef.current.x = event.clientX
    dragRef.current.distance += Math.abs(dx)
    rootRef.current.rotation.y += dx * 0.008
  }

  function endDrag(event) {
    if (!dragRef.current.active) return
    const wasDrag = dragRef.current.distance > 4
    dragRef.current.active = false
    event.target?.releasePointerCapture?.(dragRef.current.pointerId)

    if (wasDrag || !rootRef.current || !event.point) return

    const local = rootRef.current.worldToLocal(event.point.clone())
    const next = [local.x, local.y, local.z].map((value) => Number(value.toFixed(4)))
    setMarker(next)
    onPick?.(next)
  }

  return (
    <>
      <ambientLight intensity={2.3} />
      <directionalLight position={[2, 3, 3]} intensity={3.4} />
      <directionalLight position={[-2, 1, 1]} intensity={1.3} />
      <gridHelper args={[6, 12, '#334052', '#1d2632']} position={[0, 0, 0]} />
      <group
        ref={rootRef}
        rotation={[0, 0, 0]}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        {model && <primitive object={model} />}
        {marker && (
          <mesh position={marker} renderOrder={20}>
            <sphereGeometry args={[0.035, 20, 14]} />
            <meshBasicMaterial color="#ffffff" depthTest={false} />
          </mesh>
        )}
      </group>
    </>
  )
}

function CameraSetup() {
  const { camera } = useThree()

  useEffect(() => {
    camera.position.set(0, 1.05, 3.2)
    camera.lookAt(0, 0.75, 0)
    camera.near = 0.01
    camera.far = 50
    camera.updateProjectionMatrix()
  }, [camera])

  return null
}

export default function ModelAnnotationPlacementDialog({
  modelUrl,
  modelScale = 1,
  annotation,
  onConfirm,
  onClose,
}) {
  const [position, setPosition] = useState(
    Array.isArray(annotation?.position) ? annotation.position : null,
  )
  const [status, setStatus] = useState({ state: 'idle', error: '' })
  const positionLabel = useMemo(() => (
    position ? position.map((value) => Number(value).toFixed(3)).join(', ') : 'No point selected'
  ), [position])

  return (
    <div className="modal-backdrop annotation-placement-backdrop" onMouseDown={onClose}>
      <section
        className="annotation-placement-dialog"
        aria-label="Place model annotation"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <div className="editor-eyebrow">Visual placement</div>
            <h2>{annotation?.label || 'Model annotation'}</h2>
            <p>Drag the model to rotate it. Click the exact surface point where this annotation belongs.</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>

        <div className="annotation-placement-stage">
          <Canvas camera={{ position: [0, 1.05, 3.2], fov: 45 }}>
            <CameraSetup />
            <AnnotationModel
              modelUrl={modelUrl}
              modelScale={modelScale}
              initialPosition={position}
              onPick={setPosition}
              onStatus={setStatus}
            />
          </Canvas>
          <div className="annotation-placement-stage__hint">
            {status.state === 'loading' && 'Loading model...'}
            {status.state === 'ready' && 'Drag to rotate · click to place'}
            {status.state === 'error' && status.error}
          </div>
        </div>

        <footer>
          <div>
            <span className="muted">Selected point</span>
            <strong>{positionLabel}</strong>
          </div>
          <div className="button-row">
            <button type="button" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="primary"
              disabled={!position}
              onClick={() => onConfirm?.(position)}
            >
              Use this point
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
