import React, { useEffect, useId, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { normalizeInspectionModel, inspectionBounds, inspectionFitDistance } from '../../product/modelPresentation'

function findNamedAnchor(object, stopAt) {
  let current = object
  while (current && current !== stopAt) {
    if (current.name) return current
    current = current.parent
  }
  return object
}

function AnnotationModel({ modelUrl, modelScale, upAxis, fitRequest, initialPosition, initialNormal, onPick, onStatus }) {
  const { gl } = useThree()
  const rootRef = useRef(null)
  const dragRef = useRef({ active: false, pointerId: null, x: 0, y: 0, distance: 0 })
  const [model, setModel] = useState(null)
  const [marker, setMarker] = useState(initialPosition || null)
  const [markerNormal, setMarkerNormal] = useState(initialNormal || [0, 0, 1])

  useEffect(() => {
    setMarker(initialPosition || null)
    setMarkerNormal(initialNormal || [0, 0, 1])
  }, [initialNormal, initialPosition])

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
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/vendor/draco/')
    loader.setDRACOLoader(dracoLoader)
    const ktx2Loader = new KTX2Loader()
    ktx2Loader.setTranscoderPath('/vendor/basis/')
    ktx2Loader.detectSupport(gl)
    loader.setKTX2Loader(ktx2Loader)

    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return
        try {
          loadedScene = normalizeInspectionModel(cloneSkeleton(gltf.scene), modelScale, upAxis)
        } catch (error) {
          onStatus?.({ state: 'error', error: error.message })
          return
        }
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
      dracoLoader.dispose()
      ktx2Loader.dispose()
    }
  }, [gl, modelScale, modelUrl, upAxis, onStatus])

  function beginDrag(event) {
    if (dragRef.current.active && dragRef.current.pointerId !== event.pointerId) { dragRef.current.distance = Infinity; return }
    if (event.button !== 0 || dragRef.current.active) return
    let object = event.object
    while (object && object !== model) object = object.parent
    if (!object) return
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      distance: 0,
    }
    event.target?.setPointerCapture?.(event.pointerId)
  }

  function moveDrag(event) {
    if (!dragRef.current.active || event.pointerId !== dragRef.current.pointerId || !rootRef.current) return
    dragRef.current.distance = Math.max(dragRef.current.distance, Math.hypot(event.clientX - dragRef.current.x, event.clientY - dragRef.current.y))
  }

  function endDrag(event) {
    if (!dragRef.current.active || event.pointerId !== dragRef.current.pointerId) return
    const wasDrag = dragRef.current.distance > 4
    dragRef.current.active = false
    event.target?.releasePointerCapture?.(dragRef.current.pointerId)

    if (wasDrag || !rootRef.current || !event.point) return
    let object = event.object
    while (object && object !== model) object = object.parent
    if (!object) return

    const local = rootRef.current.worldToLocal(event.point.clone())
    const next = [local.x, local.y, local.z].map((value) => Number(value.toFixed(4)))

    let normal = [0, 0, 1]
    let worldNormal = null
    if (event.face?.normal && event.object?.matrixWorld) {
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(event.object.matrixWorld)
      worldNormal = event.face.normal.clone().applyMatrix3(normalMatrix).normalize()
      const rootQuaternion = rootRef.current.getWorldQuaternion(new THREE.Quaternion()).invert()
      const localNormal = worldNormal.clone().applyQuaternion(rootQuaternion).normalize()
      normal = [localNormal.x, localNormal.y, localNormal.z].map((value) => Number(value.toFixed(4)))
    }

    const anchor = findNamedAnchor(event.object, rootRef.current)
    let anchorNode = ''
    let anchorPosition = null
    let anchorNormal = null
    if (anchor?.name) {
      anchorNode = anchor.name
      const nodePoint = anchor.worldToLocal(event.point.clone())
      anchorPosition = [nodePoint.x, nodePoint.y, nodePoint.z].map((value) => Number(value.toFixed(4)))
      if (worldNormal) {
        const anchorQuaternion = anchor.getWorldQuaternion(new THREE.Quaternion()).invert()
        const nodeNormal = worldNormal.clone().applyQuaternion(anchorQuaternion).normalize()
        anchorNormal = [nodeNormal.x, nodeNormal.y, nodeNormal.z].map((value) => Number(value.toFixed(4)))
      }
    }

    setMarker(next)
    setMarkerNormal(normal)
    onPick?.({ position: next, normal, anchorNode, anchorPosition, anchorNormal })
  }

  return (
    <>
      {model && <CameraSetup model={model} fitRequest={fitRequest} />}
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
        onPointerCancel={() => { dragRef.current.active = false }}
      >
        {model && <primitive object={model} />}
        {marker && (
          <group position={marker} renderOrder={20}>
            <mesh>
              <sphereGeometry args={[0.035, 20, 14]} />
              <meshBasicMaterial color="#ffffff" depthTest={false} />
            </mesh>
            <arrowHelper
              args={[new THREE.Vector3(...markerNormal).normalize(), new THREE.Vector3(0, 0, 0), 0.18, 0xa9c5ff, 0.055, 0.025]}
            />
          </group>
        )}
      </group>
    </>
  )
}

function CameraSetup({ model, fitRequest }) {
  const { camera, gl, size } = useThree()
  const controls = useRef(null)
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.enableDamping = true
    controls.current = orbit
    return () => { orbit.dispose(); controls.current = null }
  }, [camera, gl])
  useFrame(() => controls.current?.update())

  useEffect(() => {
    const bounds = inspectionBounds(model)
    const distance = inspectionFitDistance(bounds.radius, camera.fov, size.width / Math.max(1, size.height))
    const target = new THREE.Vector3(...bounds.center)
    camera.position.copy(target).add(new THREE.Vector3(0, 0, distance))
    camera.lookAt(target)
    if (controls.current) {
      controls.current.target.copy(target)
      controls.current.minDistance = bounds.radius * 0.4
      controls.current.maxDistance = distance * 3
      controls.current.update()
    }
    camera.near = Math.max(0.001, bounds.radius / 100)
    camera.far = distance * 10
    camera.updateProjectionMatrix()
  }, [camera, model, size.width, size.height, fitRequest])

  return null
}

export default function ModelAnnotationPlacementDialog({
  modelUrl,
  modelScale = 1,
  upAxis = 'y',
  annotation,
  requireNewPoint = false,
  onConfirm,
  onClose,
}) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const [point, setPoint] = useState({
    position: Array.isArray(annotation?.position) ? annotation.position : null,
    normal: Array.isArray(annotation?.normal) ? annotation.normal : [0, 0, 1],
    anchorNode: annotation?.anchorNode || '',
    anchorPosition: Array.isArray(annotation?.anchorPosition) ? annotation.anchorPosition : null,
    anchorNormal: Array.isArray(annotation?.anchorNormal) ? annotation.anchorNormal : null,
  })
  const position = point.position
  const [picked, setPicked] = useState(false)
  const [fitRequest, setFitRequest] = useState(0)
  const [detailLabel, setDetailLabel] = useState(annotation?.label || '')
  const [detailBody, setDetailBody] = useState(annotation?.body || '')
  const [status, setStatus] = useState({ state: 'idle', error: '' })

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="annotation-placement-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
    >
      <header>
        <div>
          <div className="editor-eyebrow">Visual placement</div>
          <h2 id={titleId}>{annotation?.label || 'Model annotation'}</h2>
          <p>Drag to see every side. Scroll or pinch to zoom. Tap a surface to place the detail point.</p>
        </div>
        <button type="button" onClick={onClose}>Close</button>
      </header>

      <div className="annotation-placement-stage">
        <Canvas camera={{ position: [0, 1.05, 3.2], fov: 45 }}>
          <AnnotationModel
            modelUrl={modelUrl}
            modelScale={modelScale}
            upAxis={upAxis}
            fitRequest={fitRequest}
            initialPosition={position}
            initialNormal={point.normal}
            onPick={(next) => { setPoint(next); setPicked(true) }}
            onStatus={setStatus}
          />
        </Canvas>
        <button className="annotation-placement-fit" type="button" onClick={() => setFitRequest((value) => value + 1)} disabled={status.state !== 'ready'}>Fit model</button>
        <div className="annotation-placement-stage__hint" role="status">
          {status.state === 'loading' && 'Loading model…'}
          {status.state === 'ready' && 'Drag to rotate · click to place'}
          {status.state === 'error' && status.error}
        </div>
      </div>

      <footer>
        <div className="annotation-placement-fields">
          <label>Point name<input value={detailLabel} onChange={(event) => setDetailLabel(event.target.value)} placeholder="e.g. Adjustable handle" /></label>
          <label>Description<input value={detailBody} onChange={(event) => setDetailBody(event.target.value)} placeholder="What should visitors know?" /></label>
          <span className="muted" role="status">{picked ? 'Point selected on the model' : position ? 'Current point ready' : 'Tap the model to choose a point'}</span>
        </div>
        <div className="button-row">
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={!position || status.state !== 'ready' || (requireNewPoint && !picked)}
            onClick={() => onConfirm?.({ ...point, label: detailLabel.trim() || 'Detail', body: detailBody })}
          >
            Save detail point
          </button>
        </div>
      </footer>
    </dialog>
  )
}
