import React, { useCallback, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import PanoramaTransition from './PanoramaTransition'
import Hotspot from './Hotspot'
import GazeCursor from './GazeCursor'
import XRControllerInput from './XRControllerInput'
import DesktopControls from './DesktopControls'
import PhoneOrientationControls, { requestPhoneMotionPermission } from './PhoneOrientationControls'
import PhoneStereoRenderer from './PhoneStereoRenderer'
import PanoramaClickSurface from './PanoramaClickSurface'
import ViewerModeBar from './ViewerModeBar'
import ProductInspector3D from './product/ProductInspector3D'
import ProductInspectorHUD from './product/ProductInspectorHUD'
import InfoOverlay from './InfoOverlay'
import WorldInfoPanel from './product/WorldInfoPanel'
import KeyboardInput from '../input/KeyboardInput'
import RemoteInputAdapter from '../input/RemoteInputAdapter'
import { InteractionProvider } from '../contexts/InteractionContext'
import { useViewerCapabilities } from '../hooks/useViewerCapabilities'
import { ACTION_TYPES, normalizeHotspotActions } from '../actions/actionTypes'

function RendererBridge({ onReady }) {
  const { gl } = useThree()
  React.useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace
    onReady?.(gl)
  }, [gl, onReady])
  return null
}

function SceneContent({
  scene,
  onHotspotActivate,
  editMode,
  placingHotspot,
  onPlaceHotspot,
  selectedHotspotId,
  onSelectHotspot,
  mode,
  phoneHeadset,
  onMotionActiveChange,
  onRendererReady,
  inspection,
  info,
  inspectorRef,
  onInspectorClose,
  onInspectorAnimations,
  onInspectorStatus,
  onInfoClose,
}) {
  const modalOpen = Boolean(inspection || info)
  const immersiveOverlay = mode === 'vr' || (mode === 'phone' && phoneHeadset)

  return (
    <>
      <RendererBridge onReady={onRendererReady} />
      <PanoramaTransition scene={scene} />
      <DesktopControls enabled={!modalOpen && (mode === 'pc' || (mode === 'phone' && !phoneHeadset))} />
      <PhoneOrientationControls
        enabled={mode === 'phone'}
        onActiveChange={onMotionActiveChange}
      />
      <PhoneStereoRenderer enabled={mode === 'phone' && phoneHeadset} />
      <XRControllerInput enabled={mode === 'vr'} />
      <GazeCursor enabled={mode === 'vr' || (mode === 'phone' && phoneHeadset)} />
      <PanoramaClickSurface
        enabled={!modalOpen && editMode && placingHotspot}
        onPick={onPlaceHotspot}
      />

      {!modalOpen && (scene?.hotspots || []).map((hotspot) => (
        <Hotspot
          key={hotspot.id}
          hotspot={hotspot}
          selected={hotspot.id === selectedHotspotId}
          editMode={editMode}
          onSelect={onSelectHotspot}
          onActivate={onHotspotActivate}
        />
      ))}

      {inspection && (
        <ProductInspector3D
          ref={inspectorRef}
          inspection={inspection}
          onClose={onInspectorClose}
          onAnimationsChange={onInspectorAnimations}
          onStatusChange={onInspectorStatus}
        />
      )}

      {info && immersiveOverlay && (
        <WorldInfoPanel info={info} onClose={onInfoClose} />
      )}
    </>
  )
}

export default function Viewer({
  sceneId,
  onNavigate,
  scenes,
  editMode = false,
  placingHotspot = false,
  selectedHotspotId = null,
  onSelectHotspot,
  onHotspotCreate,
  showModeBar = true,
}) {
  const [mode, setMode] = useState('pc')
  const [phoneHeadset, setPhoneHeadset] = useState(false)
  const [motionActive, setMotionActive] = useState(false)
  const [inspection, setInspection] = useState(null)
  const [inspectorAnimations, setInspectorAnimations] = useState([])
  const [inspectorStatus, setInspectorStatus] = useState({ state: 'idle', error: '' })
  const [info, setInfo] = useState(null)
  const rendererRef = useRef(null)
  const sessionRef = useRef(null)
  const inspectorRef = useRef(null)
  const capabilities = useViewerCapabilities()
  const historyRef = useRef([])

  const scene = scenes.find((item) => item.id === sceneId) || scenes[0]

  const closeInspection = useCallback(() => {
    setInspection(null)
    setInspectorAnimations([])
    setInspectorStatus({ state: 'idle', error: '' })
  }, [])

  const navigate = useCallback((nextId) => {
    if (!nextId || nextId === sceneId) return
    historyRef.current.push(sceneId)
    closeInspection()
    setInfo(null)
    onNavigate?.(nextId)
  }, [closeInspection, onNavigate, sceneId])

  const runAction = useCallback((action) => {
    switch (action?.type) {
      case ACTION_TYPES.NAVIGATE_SCENE:
        if (action.sceneId) navigate(action.sceneId)
        return true

      case ACTION_TYPES.INSPECT_MODEL:
        if (!action.modelUrl) {
          console.warn('[viewer] inspect-model action is missing modelUrl')
          return false
        }
        setInfo(null)
        setInspectorAnimations([])
        setInspectorStatus({ state: 'loading', error: '' })
        setInspection({
          ...action,
          id: `${action.id || 'inspection'}-${Date.now()}`,
        })
        return true

      case ACTION_TYPES.SHOW_INFO:
        closeInspection()
        setInfo({ title: action.title || 'Information', body: action.body || '' })
        return true

      case ACTION_TYPES.OPEN_URL:
        if (!action.url) return false
        window.open(action.url, action.newTab === false ? '_self' : '_blank', 'noopener,noreferrer')
        return true

      default:
        console.warn('[viewer] unsupported action', action)
        return false
    }
  }, [closeInspection, navigate])

  const activateHotspot = useCallback((hotspot) => {
    const actions = normalizeHotspotActions(hotspot)
    for (const action of actions) runAction(action)
  }, [runAction])

  const back = useCallback(() => {
    if (inspection) {
      closeInspection()
      return
    }

    if (info) {
      setInfo(null)
      return
    }

    const previous = historyRef.current.pop()
    if (previous) onNavigate?.(previous)
  }, [closeInspection, info, inspection, onNavigate])

  const choosePhone = useCallback(async () => {
    setMode('phone')
    try {
      const granted = await requestPhoneMotionPermission()
      if (!granted) setMotionActive(false)
    } catch {
      setMotionActive(false)
    }
  }, [])

  const startVR = useCallback(async () => {
    if (!capabilities.immersiveVRSupported) {
      window.alert(capabilities.immersiveVRReason)
      return
    }

    const renderer = rendererRef.current
    if (!renderer) {
      window.alert('The 3D renderer is not ready yet.')
      return
    }

    try {
      renderer.xr.enabled = true
      renderer.xr.setReferenceSpaceType('local-floor')
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      })
      sessionRef.current = session
      setMode('vr')
      session.addEventListener('end', () => {
        sessionRef.current = null
        setMode('pc')
      }, { once: true })
      await renderer.xr.setSession(session)
    } catch (error) {
      console.error('[viewer] could not enter VR', error)
      window.alert(error?.message || 'Could not start immersive VR.')
      setMode('pc')
    }
  }, [capabilities])

  const choosePC = useCallback(async () => {
    if (sessionRef.current) {
      try {
        await sessionRef.current.end()
      } catch {
        // Session can already be closing. Returning to desktop is still safe.
      }
    }
    setPhoneHeadset(false)
    setMode('pc')
  }, [])

  const togglePhoneHeadset = useCallback(async () => {
    const next = !phoneHeadset
    setPhoneHeadset(next)
    if (!next) return

    try {
      await document.documentElement.requestFullscreen?.()
    } catch {
      // Fullscreen can be denied by the browser; stereo rendering still works.
    }

    try {
      await screen.orientation?.lock?.('landscape')
    } catch {
      // Orientation lock is optional and not supported by every phone browser.
    }
  }, [phoneHeadset])

  const handlePlaceHotspot = useCallback(({ yaw, pitch }) => {
    if (!editMode || !placingHotspot) return
    onHotspotCreate?.({ yaw, pitch })
  }, [editMode, placingHotspot, onHotspotCreate])

  if (!scene) return <div className="viewer-empty">No scene selected.</div>

  return (
    <InteractionProvider onBack={back}>
      <KeyboardInput />
      <RemoteInputAdapter />

      {showModeBar && (
        <ViewerModeBar
          mode={mode}
          onPC={choosePC}
          onPhone={choosePhone}
          onVR={startVR}
          vrAvailable={capabilities.immersiveVRSupported}
          vrReason={capabilities.immersiveVRReason}
          phoneHeadset={phoneHeadset}
          onTogglePhoneHeadset={togglePhoneHeadset}
          motionActive={motionActive}
        />
      )}

      <Canvas
        className="viewer-canvas"
        camera={{ position: [0, 0, 0.01], fov: 75, near: 0.01, far: 200 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <SceneContent
          scene={scene}
          onHotspotActivate={activateHotspot}
          editMode={editMode}
          placingHotspot={placingHotspot}
          onPlaceHotspot={handlePlaceHotspot}
          selectedHotspotId={selectedHotspotId}
          onSelectHotspot={onSelectHotspot}
          mode={mode}
          phoneHeadset={phoneHeadset}
          onMotionActiveChange={setMotionActive}
          onRendererReady={(renderer) => { rendererRef.current = renderer }}
          inspection={inspection}
          info={info}
          inspectorRef={inspectorRef}
          onInspectorClose={closeInspection}
          onInspectorAnimations={setInspectorAnimations}
          onInspectorStatus={setInspectorStatus}
          onInfoClose={() => setInfo(null)}
        />
      </Canvas>

      <ProductInspectorHUD
        inspection={(mode === 'vr' || (mode === 'phone' && phoneHeadset)) ? null : inspection}
        animations={inspectorAnimations}
        status={inspectorStatus}
        onPlayAnimation={(name) => inspectorRef.current?.playAnimation(name)}
        onResetRotation={() => inspectorRef.current?.resetRotation()}
        onClose={closeInspection}
      />

      <InfoOverlay
        info={(mode === 'vr' || (mode === 'phone' && phoneHeadset)) ? null : info}
        onClose={() => setInfo(null)}
      />
    </InteractionProvider>
  )
}
