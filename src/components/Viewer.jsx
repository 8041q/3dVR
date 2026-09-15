import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import PanoramaTransition from './PanoramaTransition'
import SpatialScene from './SpatialScene'
import XRTrackingProbe from './XRTrackingProbe'
import Hotspot from './Hotspot'
import GazeCursor from './GazeCursor'
import XRControllerInput from './XRControllerInput'
import DesktopControls from './DesktopControls'
import PhoneOrientationControls, { requestPhoneMotionPermission } from './PhoneOrientationControls'
import PhoneStereoRenderer from './PhoneStereoRenderer'
import PanoramaClickSurface from './PanoramaClickSurface'
import ViewerModeBar from './ViewerModeBar'
import ProductInspector3D from './product/ProductInspector3D'
import InfoOverlay from './InfoOverlay'
import WorldInfoPanel from './product/WorldInfoPanel'
import GuideOverlay from './guides/GuideOverlay'
import GuideLauncher from './guides/GuideLauncher'
import GuideWorldPanel from './guides/GuideWorldPanel'
import GuideFocusMarker from './guides/GuideFocusMarker'
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
  phoneMotionPermission,
  onPhoneMotionStatus,
  phoneOrientationRef,
  spatialSceneRef,
  spatialRoomFailed,
  onSpatialStatus,
  onRendererReady,
  inspection,
  info,
  inspectorRef,
  onInspectorClose,
  onInspectorAnimations,
  onInspectorStatus,
  onInfoClose,
  guide,
  guideStep,
  guideStepIndex,
  onGuidePrevious,
  onGuideNext,
  onGuideExit,
  onGuidePlayNarration,
  xrTracking,
  onXRTrackingChange,
}) {
  const modalOpen = Boolean(inspection || info)
  const immersiveOverlay = mode === 'vr' || (mode === 'phone' && phoneHeadset)
  const hasSpatialRoom = Boolean(scene?.spatial?.roomUrl)
  // A spatial-configured VR scene waits for WebXR tracking classification, then
  // loads exactly one representation: room for real position tracking, panorama
  // for emulated/rotation-only tracking.
  const useSpatialRoom = mode === 'vr' && hasSpatialRoom && xrTracking === 'tracked' && !spatialRoomFailed
  const waitingForTracking = mode === 'vr' && hasSpatialRoom && xrTracking === 'unknown'
  const focusRequest = !immersiveOverlay && guideStep?.focus
    ? {
        id: `${guide?.id || 'guide'}:${guideStep.id}`,
        yaw: guideStep.focus.yaw,
        pitch: guideStep.focus.pitch,
      }
    : null

  return (
    <>
      <RendererBridge onReady={onRendererReady} />
      <XRTrackingProbe enabled={mode === 'vr'} onTrackingChange={onXRTrackingChange} />

      {useSpatialRoom ? (
        <SpatialScene ref={spatialSceneRef} scene={scene} onStatusChange={onSpatialStatus}>
          {!modalOpen && (scene?.hotspots || []).filter((hotspot) => Array.isArray(hotspot.spatialPosition)).map((hotspot) => (
            <Hotspot
              key={hotspot.id}
              hotspot={hotspot}
              spatial
              pointerEnabled={false}
              selected={hotspot.id === selectedHotspotId}
              guideHighlight={hotspot.id === guideStep?.highlightHotspotId}
              editMode={false}
              onSelect={onSelectHotspot}
              onActivate={onHotspotActivate}
            />
          ))}
        </SpatialScene>
      ) : !waitingForTracking ? (
        <>
          <PanoramaTransition scene={scene} />
          {!modalOpen && (scene?.hotspots || []).map((hotspot) => (
            <Hotspot
              key={hotspot.id}
              hotspot={hotspot}
              pointerEnabled={mode === 'pc' || editMode}
              selected={hotspot.id === selectedHotspotId}
              guideHighlight={hotspot.id === guideStep?.highlightHotspotId}
              editMode={editMode}
              onSelect={onSelectHotspot}
              onActivate={onHotspotActivate}
            />
          ))}
        </>
      ) : null}

      <DesktopControls
        enabled={!modalOpen && mode === 'pc'}
        focusRequest={focusRequest}
      />
      <PhoneOrientationControls
        ref={phoneOrientationRef}
        enabled={mode === 'phone'}
        permissionState={phoneMotionPermission}
        onStatusChange={onPhoneMotionStatus}
      />
      <PhoneStereoRenderer enabled={mode === 'phone' && phoneHeadset} />
      <XRControllerInput enabled={mode === 'vr'} />
      {mode === 'phone' && <GazeCursor enabled dwellMs={2000} alwaysVisible />}
      {mode === 'vr' && <GazeCursor enabled dwellMs={1200} />}
      <PanoramaClickSurface
        enabled={!modalOpen && editMode && placingHotspot && !useSpatialRoom}
        onPick={onPlaceHotspot}
      />

      {guideStep?.focus && !useSpatialRoom && <GuideFocusMarker focus={guideStep.focus} />}

      {inspection && (
        <ProductInspector3D
          ref={inspectorRef}
          inspection={inspection}
          immersive={immersiveOverlay}
          directManipulation={mode === 'pc'}
          onClose={onInspectorClose}
          onAnimationsChange={onInspectorAnimations}
          onStatusChange={onInspectorStatus}
        />
      )}

      {info && immersiveOverlay && (
        <WorldInfoPanel info={info} onClose={onInfoClose} />
      )}

      {guide && guideStep && immersiveOverlay && (
        <GuideWorldPanel
          guide={guide}
          step={guideStep}
          stepIndex={guideStepIndex}
          onPrevious={onGuidePrevious}
          onNext={onGuideNext}
          onExit={onGuideExit}
          onPlayNarration={onGuidePlayNarration}
        />
      )}
    </>
  )
}

export default function Viewer({
  sceneId,
  onNavigate,
  scenes,
  guides = [],
  editMode = false,
  placingHotspot = false,
  selectedHotspotId = null,
  onSelectHotspot,
  onHotspotCreate,
  showModeBar = true,
}) {
  const [mode, setMode] = useState('pc')
  const [phoneHeadset, setPhoneHeadset] = useState(false)
  const [phoneMotionPermission, setPhoneMotionPermission] = useState('unknown')
  const [phoneMotionStatus, setPhoneMotionStatus] = useState({ status: 'inactive', detail: '' })
  const [xrTracking, setXRTracking] = useState('inactive')
  const [spatialRoomFailed, setSpatialRoomFailed] = useState(false)
  const [inspection, setInspection] = useState(null)
  const [inspectorAnimations, setInspectorAnimations] = useState([])
  const [inspectorStatus, setInspectorStatus] = useState({ state: 'idle', error: '' })
  const [info, setInfo] = useState(null)
  const [guideState, setGuideState] = useState(null)
  const rendererRef = useRef(null)
  const sessionRef = useRef(null)
  const inspectorRef = useRef(null)
  const phoneOrientationRef = useRef(null)
  const spatialSceneRef = useRef(null)
  const guideAudioRef = useRef(null)
  const guideAutoActivatedRef = useRef('')
  const guideCommandAppliedRef = useRef('')
  const capabilities = useViewerCapabilities()
  const historyRef = useRef([])

  const scene = scenes.find((item) => item.id === sceneId) || scenes[0]
  const activeGuide = useMemo(
    () => guides.find((guide) => guide.id === guideState?.guideId) || null,
    [guides, guideState?.guideId],
  )
  const guideStepIndex = guideState?.stepIndex ?? -1
  const guideStep = activeGuide?.steps?.[guideStepIndex] || null
  const immersiveOverlay = mode === 'vr' || (mode === 'phone' && phoneHeadset)

  useEffect(() => {
    setSpatialRoomFailed(false)
  }, [scene?.id, scene?.spatial?.roomUrl])

  const handleSpatialStatus = useCallback((status) => {
    if (status?.state === 'error') {
      console.warn('[viewer] spatial room failed; falling back to panorama', status.error)
      setSpatialRoomFailed(true)
    }
  }, [])

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

  const exitGuide = useCallback(() => {
    guideAudioRef.current?.pause?.()
    guideAudioRef.current = null
    guideAutoActivatedRef.current = ''
    guideCommandAppliedRef.current = ''
    setGuideState(null)
  }, [])

  const startGuide = useCallback((guideId) => {
    const guide = guides.find((item) => item.id === guideId)
    if (!guide?.steps?.length) {
      console.warn('[viewer] guide has no steps', guideId)
      return false
    }

    setGuideState({
      guideId,
      stepIndex: 0,
      instanceId: Date.now(),
    })
    return true
  }, [guides])

  const guideNext = useCallback(() => {
    if (!activeGuide || guideStepIndex < 0) return false
    if (guideStepIndex >= activeGuide.steps.length - 1) {
      exitGuide()
      return true
    }

    setGuideState((current) => current ? {
      ...current,
      stepIndex: current.stepIndex + 1,
    } : current)
    return true
  }, [activeGuide, exitGuide, guideStepIndex])

  const guidePrevious = useCallback(() => {
    if (!activeGuide || guideStepIndex <= 0) return false
    setGuideState((current) => current ? {
      ...current,
      stepIndex: Math.max(0, current.stepIndex - 1),
    } : current)
    return true
  }, [activeGuide, guideStepIndex])

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

      case ACTION_TYPES.PLAY_ROOM_ANIMATION:
        if (!action.clip) {
          console.warn('[viewer] play-room-animation action is missing clip')
          return false
        }
        if (!spatialSceneRef.current?.playAnimation) {
          console.warn('[viewer] room animation requested while spatial room is not active', action.clip)
          return false
        }
        return spatialSceneRef.current.playAnimation(action.clip, {
          behavior: action.behavior || 'toggle',
          loop: action.loop || 'once',
          speed: Number(action.speed) || 1,
        })

      case ACTION_TYPES.SHOW_INFO:
        closeInspection()
        setInfo({ title: action.title || 'Information', body: action.body || '' })
        return true

      case ACTION_TYPES.OPEN_URL:
        if (!action.url) return false
        window.open(action.url, action.newTab === false ? '_self' : '_blank', 'noopener,noreferrer')
        return true

      case ACTION_TYPES.START_GUIDE:
        if (!action.guideId) return false
        return startGuide(action.guideId)

      default:
        console.warn('[viewer] unsupported action', action)
        return false
    }
  }, [closeInspection, navigate, startGuide])

  const activateHotspot = useCallback((hotspot) => {
    const actions = normalizeHotspotActions(hotspot)
    for (const action of actions) runAction(action)

    if (guideStep?.advanceOnHotspotId === hotspot.id) {
      window.setTimeout(() => guideNext(), 180)
    }
  }, [guideNext, guideStep?.advanceOnHotspotId, runAction])

  const back = useCallback(() => {
    if (inspection) {
      closeInspection()
      return
    }

    if (info) {
      setInfo(null)
      return
    }

    if (activeGuide) {
      if (guideStepIndex > 0) guidePrevious()
      else exitGuide()
      return
    }

    const previous = historyRef.current.pop()
    if (previous) onNavigate?.(previous)
  }, [activeGuide, closeInspection, exitGuide, guidePrevious, guideStepIndex, info, inspection, onNavigate])

  const playGuideNarration = useCallback(() => {
    if (!guideStep?.narrationUrl) return false

    guideAudioRef.current?.pause?.()
    const audio = new Audio(guideStep.narrationUrl)
    audio.preload = 'auto'
    guideAudioRef.current = audio
    audio.play().catch((error) => {
      console.warn('[guide] narration playback was blocked or failed', error)
    })
    return true
  }, [guideStep?.narrationUrl])

  useEffect(() => {
    if (!activeGuide || !guideStep) return undefined

    const stepKey = `${guideState.instanceId}:${activeGuide.id}:${guideStep.id}`

    if (guideStep.sceneId && guideStep.sceneId !== sceneId) {
      closeInspection()
      setInfo(null)
      onNavigate?.(guideStep.sceneId)
      return undefined
    }

    if (guideStep.narrationUrl) {
      playGuideNarration()
    }

    if (
      guideStep.autoActivateHotspotId &&
      guideAutoActivatedRef.current !== stepKey
    ) {
      const hotspot = scene?.hotspots?.find((item) => item.id === guideStep.autoActivateHotspotId)
      if (hotspot) {
        guideAutoActivatedRef.current = stepKey
        const actions = normalizeHotspotActions(hotspot)
        for (const action of actions) runAction(action)
      }
    }

    let timer = null
    if (Number(guideStep.autoAdvanceMs) > 0) {
      timer = window.setTimeout(() => guideNext(), Number(guideStep.autoAdvanceMs))
    }

    return () => {
      if (timer) window.clearTimeout(timer)
      if (guideAudioRef.current) {
        guideAudioRef.current.pause()
        guideAudioRef.current = null
      }
    }
  }, [
    activeGuide,
    closeInspection,
    guideNext,
    guideState?.instanceId,
    guideStep,
    onNavigate,
    playGuideNarration,
    runAction,
    scene,
    sceneId,
  ])

  useEffect(() => {
    if (!guideStep?.inspectionCommand || inspectorStatus.state !== 'ready') return

    const command = guideStep.inspectionCommand
    const key = `${guideState?.instanceId}:${guideStep.id}:${inspection?.id || 'no-inspection'}`
    if (guideCommandAppliedRef.current === key) return

    const hasAnimation = Boolean(command.animationClip)
    const hasVariant = Boolean(command.variantId)
    if (!hasAnimation && !hasVariant) return

    let applied = false
    if (command.variantId) {
      applied = inspectorRef.current?.applyVariant(command.variantId) || applied
    }
    if (command.animationClip) {
      applied = inspectorRef.current?.playAnimation(command.animationClip) || applied
    }

    if (applied) guideCommandAppliedRef.current = key
  }, [guideState?.instanceId, guideStep, inspection?.id, inspectorStatus.state])

  const enablePhoneMotion = useCallback(async () => {
    const result = await requestPhoneMotionPermission()
    setPhoneMotionPermission(result.granted ? 'granted' : result.code || 'denied')
    if (!result.granted) {
      setPhoneMotionStatus({ status: result.code || 'denied', detail: result.reason || 'Motion is unavailable.' })
    }
    return result.granted
  }, [])

  const choosePhone = useCallback(async () => {
    setMode('phone')
    await enablePhoneMotion()
  }, [enablePhoneMotion])

  const recenterPhone = useCallback(() => {
    phoneOrientationRef.current?.recenter?.()
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
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      })

      let referenceSpaceType = 'local-floor'
      try {
        await session.requestReferenceSpace('local-floor')
      } catch {
        referenceSpaceType = 'local'
      }
      renderer.xr.setReferenceSpaceType(referenceSpaceType)

      sessionRef.current = session
      setXRTracking('unknown')
      setMode('vr')
      session.addEventListener('end', () => {
        sessionRef.current = null
        setXRTracking('inactive')
        setMode('pc')
      }, { once: true })
      await renderer.xr.setSession(session)
    } catch (error) {
      console.error('[viewer] could not enter VR', error)
      window.alert(error?.message || 'Could not start immersive VR.')
      setXRTracking('inactive')
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
    setPhoneMotionStatus({ status: 'inactive', detail: '' })
    setXRTracking('inactive')
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
    <InteractionProvider
      onBack={back}
      onNext={activeGuide ? guideNext : undefined}
      onPrevious={activeGuide ? guidePrevious : undefined}
      onHome={activeGuide ? exitGuide : undefined}
    >
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
          phoneMotionStatus={phoneMotionStatus}
          onEnablePhoneMotion={enablePhoneMotion}
          onRecenterPhone={recenterPhone}
          xrTracking={xrTracking}
          spatialAvailable={Boolean(scene?.spatial?.roomUrl)}
        />
      )}

      <Canvas
        className="viewer-canvas"
        camera={{ position: [0, 0, 0.01], fov: 75, near: 0.01, far: 200 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={mode === 'phone' ? [1, phoneHeadset ? 1.25 : 1.5] : [1, 2]}
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
          phoneMotionPermission={phoneMotionPermission}
          onPhoneMotionStatus={setPhoneMotionStatus}
          phoneOrientationRef={phoneOrientationRef}
          spatialSceneRef={spatialSceneRef}
          spatialRoomFailed={spatialRoomFailed}
          onSpatialStatus={handleSpatialStatus}
          onRendererReady={(renderer) => { rendererRef.current = renderer }}
          inspection={inspection}
          info={info}
          inspectorRef={inspectorRef}
          onInspectorClose={closeInspection}
          onInspectorAnimations={setInspectorAnimations}
          onInspectorStatus={setInspectorStatus}
          onInfoClose={() => setInfo(null)}
          guide={activeGuide}
          guideStep={guideStep}
          guideStepIndex={guideStepIndex}
          onGuidePrevious={guidePrevious}
          onGuideNext={guideNext}
          onGuideExit={exitGuide}
          onGuidePlayNarration={playGuideNarration}
          xrTracking={xrTracking}
          onXRTrackingChange={setXRTracking}
        />
      </Canvas>

      <GuideLauncher
        guides={guides}
        activeGuide={activeGuide}
        onStart={startGuide}
      />

      {!immersiveOverlay && (
        <GuideOverlay
          guide={activeGuide}
          step={guideStep}
          stepIndex={guideStepIndex}
          onPrevious={guidePrevious}
          onNext={guideNext}
          onExit={exitGuide}
          onPlayNarration={playGuideNarration}
        />
      )}

      <InfoOverlay
        info={immersiveOverlay ? null : info}
        onClose={() => setInfo(null)}
      />
    </InteractionProvider>
  )
}
