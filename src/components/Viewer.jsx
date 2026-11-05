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
import PhoneCalibrationPanel from './PhoneCalibrationPanel'
import PanoramaClickSurface from './PanoramaClickSurface'
import ViewerModeBar from './ViewerModeBar'
import ProductInspector3D from './product/ProductInspector3D'
import ProductInspection from './product/ProductInspection'
import InfoOverlay from './InfoOverlay'
import WorldInfoPanel from './product/WorldInfoPanel'
import GuideOverlay from './guides/GuideOverlay'
import GuideLauncher from './guides/GuideLauncher'
import GuideWorldPanel from './guides/GuideWorldPanel'
import GuideFocusMarker from './guides/GuideFocusMarker'
import KeyboardInput from '../input/KeyboardInput'
import RemoteInputAdapter from '../input/RemoteInputAdapter'
import { InteractionProvider } from '../contexts/InteractionContext'
import { createXRSessionController } from '../viewer/xrSession'
import { useViewerCapabilities } from '../hooks/useViewerCapabilities'
import { ACTION_TYPES, runHotspotActions, visibleInPanorama } from '../actions/actionTypes'
import { PHONE_VIEW_MODES, loadPhoneViewProfile, savePhoneViewProfile } from '../phoneViewProfile'
import { guideAdvanceHotspot, guideEntryAction, guideEntryKey, guideProductTarget, moveGuidePlayback } from '../guides/guidePlayback'
import { useGuideStep } from '../guides/useGuideStep'
import { actionUrl } from '../viewer/actionUrl'
import { panoramaKey } from '../panorama/panoramaSource'
import { useViewerOverlays } from '../viewer/useViewerOverlays'

function RendererBridge({ onReady }) {
  const { gl, camera } = useThree()

  React.useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace
    onReady?.(gl, camera)
  }, [gl, camera, onReady])

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
  vrPending,
  phoneViewProfile,
  phoneMotionActive,
  calibratingPhone,
  phoneMotionPermission,
  onPhoneMotionStatus,
  phoneOrientationRef,
  spatialSceneRef,
  spatialRoomFailed,
  onSpatialStatus,
  panoramaAttempt,
  panoramaReady,
  onPanoramaStatus,
  onRendererReady,
  inspection,
  info,
  inspectorRef,
  onInspectorClose,
  onInspectorStatus,
  onInfoClose,
  guide,
  guideStep,
  guideStepIndex,
  guideEntry,
  onGuidePrevious,
  onGuideNext,
  onGuideExit,
  xrTracking,
  onXRTrackingChange,
  editorFocusRequest,
  editorViewRef,
  editorHighlightedHotspotId,
}) {
  const modalOpen = Boolean(inspection || info)
  const immersiveOverlay = mode === 'vr' || (mode === 'phone' && phoneHeadset)
  const touchFallback = mode === 'phone' && !phoneHeadset && !phoneMotionActive
  const pointerControls = mode === 'pc' || touchFallback
  const hasSpatialRoom = Boolean(scene?.spatial?.roomUrl)
  // A spatial-configured VR scene waits for WebXR tracking classification, then
  // loads exactly one representation: room for real position tracking, panorama
  // for emulated/rotation-only tracking.
  const useSpatialRoom = mode === 'vr' && hasSpatialRoom && xrTracking === 'tracked' && !spatialRoomFailed
  const waitingForTracking = mode === 'vr' && hasSpatialRoom && xrTracking === 'unknown'
  const guideTarget = !guideStep?.sceneId || guideStep.sceneId === scene?.id ? guideStep : null
  const focusRequest = !immersiveOverlay && guideTarget?.focus
    ? {
        id: `guide:${guideEntry}`,
        yaw: guideTarget.focus.yaw,
        pitch: guideTarget.focus.pitch,
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
              guideHighlight={hotspot.id === (editorHighlightedHotspotId || guideTarget?.highlightHotspotId)}
              editMode={false}
              onSelect={onSelectHotspot}
              onActivate={onHotspotActivate}
            />
          ))}
        </SpatialScene>
      ) : !waitingForTracking ? (
        <>
          <PanoramaTransition key={panoramaAttempt} scene={scene} onStatus={onPanoramaStatus} />
          {!modalOpen && !placingHotspot && (editMode || panoramaReady) && (scene?.hotspots || [])
            .filter((hotspot) => editMode || visibleInPanorama(hotspot)).map((hotspot) => (
            <Hotspot
              key={hotspot.id}
              hotspot={hotspot}
              pointerEnabled={pointerControls || editMode}
              selected={hotspot.id === selectedHotspotId}
              guideHighlight={hotspot.id === (editorHighlightedHotspotId || guideTarget?.highlightHotspotId)}
              editMode={editMode}
              onSelect={onSelectHotspot}
              onActivate={onHotspotActivate}
            />
          ))}
        </>
      ) : null}

      <DesktopControls
        enabled={!modalOpen && pointerControls && !vrPending}
        controlledFov={mode === 'phone' ? phoneViewProfile.fovDeg : null}
        focusRequest={editorFocusRequest || focusRequest}
        viewRef={editorViewRef}
      />
      <PhoneOrientationControls
        ref={phoneOrientationRef}
        enabled={mode === 'phone' && !vrPending}
        permissionState={phoneMotionPermission}
        onStatusChange={onPhoneMotionStatus}
        touchEnabled={!modalOpen && phoneMotionActive && phoneViewProfile?.mode === PHONE_VIEW_MODES.MAGIC_WINDOW && phoneViewProfile?.touchLookEnabled}
        fov={phoneViewProfile?.fovDeg}
      />
      <PhoneStereoRenderer enabled={mode === 'phone' && phoneHeadset && !vrPending} profile={phoneViewProfile} />
      <XRControllerInput enabled={mode === 'vr'} />
      <GazeCursor enabled={!vrPending && (mode === 'vr' || (mode === 'phone' && !touchFallback))} dwellMs={mode === 'phone' ? 2000 : 1200}
        alwaysVisible={mode === 'phone'} suspended={calibratingPhone} />
      <PanoramaClickSurface
        enabled={!modalOpen && editMode && placingHotspot && !useSpatialRoom && panoramaReady}
        onPick={onPlaceHotspot}
      />

      {guideTarget?.focus && !useSpatialRoom && <GuideFocusMarker focus={guideTarget.focus} />}

      {inspection && immersiveOverlay && (
        <ProductInspector3D
          ref={inspectorRef}
          inspection={inspection}
          immersive={immersiveOverlay}
          directManipulation={pointerControls}
          inputHint={mode === 'vr' ? 'Hold your gaze, or point and select.'
            : !pointerControls ? 'Hold the crosshair on a control to select it.'
              : mode === 'phone' ? 'Drag to rotate. Pinch to zoom.' : undefined}
          onClose={onInspectorClose}
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
  editorFocusRequest = null,
  editorViewRef = null,
  editorHighlightedHotspotId = '',
  openLinksInNewTab = false,
  onPanoramaStatus,
  initialGuideId = '',
  initialGuideStepId = '',
  overlayChildren = null,
}) {
  const [mode, setMode] = useState('pc')
  const [phoneViewProfile, setPhoneViewProfile] = useState(() => loadPhoneViewProfile())
  const [savedPhoneViewProfile, setSavedPhoneViewProfile] = useState(() => loadPhoneViewProfile())
  const [phoneCalibrationOpen, setPhoneCalibrationOpen] = useState(false)
  const phoneHeadset = phoneViewProfile.mode === PHONE_VIEW_MODES.HEADSET_STEREO
  const [phoneMotionPermission, setPhoneMotionPermission] = useState('unknown')
  const [phoneMotionStatus, setPhoneMotionStatus] = useState({ status: 'inactive', detail: '' })
  const [xrTracking, setXRTracking] = useState('inactive')
  const [spatialRoomFailed, setSpatialRoomFailed] = useState(false)
  const [spatialReadyKey, setSpatialReadyKey] = useState('')
  const [panoramaStatus, setPanoramaStatus] = useState(null)
  const [panoramaAttempt, setPanoramaAttempt] = useState(0)
  const [inspection, setInspection] = useState(null)
  const [inspectorStatus, setInspectorStatus] = useState({ state: 'idle', error: '' })
  const [info, setInfo] = useState(null)
  const [guideState, setGuideState] = useState(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const [vrPending, setVRPending] = useState(false)
  const xrControllerRef = useRef(null)
  const inspectorRef = useRef(null)
  const phoneOrientationRef = useRef(null)
  const phoneFullscreen = useRef(false)
  const phoneHeadsetAttempt = useRef(0)
  const spatialSceneRef = useRef(null)
  const guideSequence = useRef(0)
  const previewGuideStarted = useRef(false)
  const guideCommandAttempt = useRef(null)
  const capabilities = useViewerCapabilities()
  const historyRef = useRef([])

  const scene = scenes.find((item) => item.id === sceneId) || scenes[0]
  const activeGuide = useMemo(
    () => guides.find((guide) => guide.id === guideState?.guideId) || null,
    [guides, guideState?.guideId],
  )
  const guideStepIndex = guideState?.stepIndex ?? -1
  const guideStep = activeGuide?.steps?.[guideStepIndex] || null
  const guideEntry = guideStep ? guideEntryKey(guideState) : ''
  const guideSceneId = guideStep?.sceneId && scenes.some((item) => item.id === guideStep.sceneId) ? guideStep.sceneId : null
  const immersiveOverlay = mode === 'vr' || (mode === 'phone' && phoneHeadset)
  const spatialKey = JSON.stringify([scene?.id, scene?.spatial?.roomUrl])
  const usingSpatial = Boolean(scene?.spatial?.roomUrl) && !spatialRoomFailed
    && mode === 'vr' && xrTracking === 'tracked'
  const waitingForTracking = mode === 'vr' && Boolean(scene?.spatial?.roomUrl) && xrTracking === 'unknown'
  const media = panoramaStatus?.key === panoramaKey(scene) ? panoramaStatus : null
  const panoramaReady = media?.state === 'ready'
  const sceneReady = !waitingForTracking && (usingSpatial ? spatialReadyKey === spatialKey : panoramaReady)
  const advanceOnHotspotId = guideAdvanceHotspot(guideStep)

  const handlePanoramaStatus = useCallback((status) => {
    setPanoramaStatus(status)
    onPanoramaStatus?.(status)
  }, [onPanoramaStatus])

  useEffect(() => {
    setSpatialRoomFailed(false)
  }, [scene?.id, scene?.spatial?.roomUrl])

  const handleSpatialStatus = useCallback((status) => {
    setSpatialReadyKey(status?.state === 'ready' ? spatialKey : '')
    if (status?.state === 'error') {
      console.warn('[viewer] spatial room failed; falling back to panorama', status.error)
      setSpatialRoomFailed(true)
    }
  }, [spatialKey])

  const closeInspection = useCallback(() => {
    setInspection(null)
    setInspectorStatus({ state: 'idle', error: '' })
  }, [])

  const navigate = useCallback((nextId) => {
    if (!scenes.some((item) => item.id === nextId)) return false
    if (nextId === scene?.id) return true
    if (scene && historyRef.current.at(-1) !== scene.id) historyRef.current.push(scene.id)
    closeInspection()
    setInfo(null)
    onNavigate?.(nextId)
    return true
  }, [closeInspection, onNavigate, scene, scenes])

  const exitGuide = useCallback(() => {
    setGuideState(null)
  }, [])

  const startGuide = useCallback((guideId, stepId = '') => {
    const guide = guides.find((item) => item.id === guideId)
    if (!guide?.steps?.length) {
      console.warn('[viewer] guide has no steps', guideId)
      return false
    }

    setGuideState({
      guideId,
      stepIndex: Math.max(0, guide.steps.findIndex((step) => step.id === stepId)),
      instanceId: ++guideSequence.current,
      entry: 0,
    })
    return true
  }, [guides])

  useEffect(() => {
    if (!initialGuideId || previewGuideStarted.current) return
    previewGuideStarted.current = startGuide(initialGuideId, initialGuideStepId)
  }, [initialGuideId, initialGuideStepId, startGuide])

  const moveGuide = useCallback((entry, direction) => {
    if (!entry || !activeGuide) return false
    setGuideState((current) => moveGuidePlayback(current, entry, activeGuide.steps.length, direction))
    return true
  }, [activeGuide])

  const guideNext = useCallback(() => moveGuide(guideEntry, 1), [guideEntry, moveGuide])
  const guidePrevious = useCallback(() => moveGuide(guideEntry, -1), [guideEntry, moveGuide])

  const runAction = useCallback((action, sourceHotspotId, entry = '') => {
    switch (action?.type) {
      case ACTION_TYPES.NAVIGATE_SCENE:
        return navigate(action.sceneId)

      case ACTION_TYPES.INSPECT_MODEL:
        if (!action.modelUrl) {
          console.warn('[viewer] inspect-model action is missing modelUrl')
          return false
        }
        setInfo(null)
        setInspectorStatus({ state: 'loading', error: '' })
        setInspection({
          ...action,
          id: `${action.id || 'inspection'}-${Date.now()}`,
          actionId: action.id,
          sourceHotspotId,
          guideEntry: entry,
        })
        return true

      case ACTION_TYPES.PLAY_ROOM_ANIMATION:
        if (!action.clip) {
          console.warn('[viewer] play-room-animation action is missing clip')
          return false
        }
        if (!spatialSceneRef.current?.playAnimation) return false
        return spatialSceneRef.current.playAnimation(action.clip, {
          behavior: action.behavior || 'toggle',
          loop: action.loop || 'once',
          speed: Number(action.speed) || 1,
        })

      case ACTION_TYPES.SHOW_INFO:
        closeInspection()
        setInfo({ title: action.title || 'Information', body: action.body || '', guideEntry: entry })
        return true

      case ACTION_TYPES.OPEN_URL: {
        const url = actionUrl(action.url, window.location.href)
        if (!url) return false
        window.open(url, !openLinksInNewTab && action.newTab === false ? '_self' : '_blank', 'noopener,noreferrer')
        return true
      }

      case ACTION_TYPES.START_GUIDE:
        if (!action.guideId) return false
        return startGuide(action.guideId)

      default:
        console.warn('[viewer] unsupported action', action)
        return false
    }
  }, [closeInspection, navigate, openLinksInNewTab, startGuide])

  const { entered: guideStepEntered } = useGuideStep({
    entryKey: guideEntry,
    step: guideStep,
    sceneId: scene?.id,
    destinationId: guideSceneId,
    ready: sceneReady,
    onNavigate: (nextId) => {
      closeInspection()
      setInfo(null)
      onNavigate?.(nextId)
    },
    onActivate: () => {
      const action = guideEntryAction(guideStep, scene)
      if (action) runAction(action, guideStep.autoActivateHotspotId, guideEntry)
    },
    onAdvance: (entry) => moveGuide(entry, 1),
  })

  const activateHotspot = useCallback((hotspot) => {
    runHotspotActions(hotspot, (action) => runAction(action, hotspot.id))

    if (guideStepEntered && guideSceneId === scene?.id && advanceOnHotspotId === hotspot.id) {
      moveGuide(guideEntry, 1)
    }
  }, [advanceOnHotspotId, guideEntry, guideSceneId, guideStepEntered, moveGuide, runAction, scene?.id])

  useEffect(() => {
    if (info?.guideEntry && info.guideEntry !== guideEntry) setInfo(null)
    if (inspection?.guideEntry && inspection.guideEntry !== guideEntry) closeInspection()
  }, [closeInspection, guideEntry, info, inspection])

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

    let previous = historyRef.current.pop()
    while (previous && !scenes.some((item) => item.id === previous)) previous = historyRef.current.pop()
    if (previous) onNavigate?.(previous)
  }, [activeGuide, closeInspection, exitGuide, guidePrevious, guideStepIndex, info, inspection, onNavigate, scenes])

  useEffect(() => {
    if (!guideStepEntered || inspectorStatus.state !== 'ready' || !inspection || !inspectorRef.current) return
    const target = guideProductTarget(guideStep, scene)
    if (!target || target.hotspotId !== inspection.sourceHotspotId || target.action.id !== inspection.actionId
      || (target.autoOpen && inspection.guideEntry !== guideEntry)) return
    const { animationClip, variantId } = guideStep.inspectionCommand || {}
    const key = `${guideEntry}:${inspection.id}`
    if ((!animationClip && !variantId) || guideCommandAttempt.current === key) return
    guideCommandAttempt.current = key

    const inspector = inspectorRef.current
    if (animationClip && !inspector.playAnimation(animationClip)) {
      console.warn('[guide] Product animation unavailable:', animationClip)
    }
    if (variantId) {
      inspector.applyVariant(variantId).then((applied) => {
        if (!applied) console.warn('[guide] Product finish unavailable:', variantId)
      }).catch((error) => console.warn('[guide] Could not apply product finish', error))
    }
  }, [guideEntry, guideStep, guideStepEntered, inspection, inspectorStatus.state, scene])

  const enablePhoneMotion = useCallback(async () => {
    const result = await requestPhoneMotionPermission()
    setPhoneMotionPermission(result.granted ? 'granted' : result.code || 'denied')
    if (!result.granted) {
      setPhoneMotionStatus({ status: result.code || 'denied', detail: result.reason || 'Motion is unavailable.' })
    }
    return result.granted
  }, [])

  const releasePhoneHeadset = useCallback(() => {
    phoneHeadsetAttempt.current += 1
    if (!phoneFullscreen.current) return
    phoneFullscreen.current = false
    try { screen.orientation?.unlock?.() } catch {}
    if (document.fullscreenElement === document.documentElement) {
      void document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  const cancelCalibrationDraft = useCallback(() => {
    if (phoneCalibrationOpen) setPhoneViewProfile(savedPhoneViewProfile)
    setPhoneCalibrationOpen(false)
  }, [phoneCalibrationOpen, savedPhoneViewProfile])

  useEffect(() => {
    const controller = createXRSessionController({
      onMode: setMode, onPending: setVRPending, onTracking: setXRTracking,
      onError: (error) => { console.error('[viewer] could not enter VR', error); window.alert(error?.message || 'Could not start immersive VR.') },
    })
    xrControllerRef.current = controller
    return () => controller.dispose()
  }, [])

  const choosePhone = useCallback(async () => {
    cancelCalibrationDraft()
    // Request from the click itself, before fullscreen or XR teardown can
    // consume the browser's user activation.
    const permission = enablePhoneMotion()
    if (mode !== 'phone') {
      releasePhoneHeadset()
      setPhoneViewProfile((current) => ({ ...current, mode: PHONE_VIEW_MODES.MAGIC_WINDOW }))
    }
    await xrControllerRef.current?.select('phone')
    await permission
  }, [enablePhoneMotion, mode, releasePhoneHeadset, cancelCalibrationDraft])

  const exitPhoneHeadset = useCallback(() => {
    cancelCalibrationDraft()
    releasePhoneHeadset()
    setPhoneCalibrationOpen(false)
    setPhoneViewProfile((current) => ({ ...current, mode: PHONE_VIEW_MODES.MAGIC_WINDOW }))
  }, [releasePhoneHeadset, cancelCalibrationDraft])

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

    if (!cameraRef.current) return
    cancelCalibrationDraft()
    releasePhoneHeadset()
    // Roll back a live calibration preview before saving the non-XR camera.
    if (mode === 'phone') {
      cameraRef.current.fov = (phoneCalibrationOpen ? savedPhoneViewProfile : phoneViewProfile).fovDeg
      cameraRef.current.updateProjectionMatrix()
    }
    await xrControllerRef.current?.start(navigator.xr, renderer, cameraRef.current)
  }, [capabilities, releasePhoneHeadset, cancelCalibrationDraft, mode, phoneCalibrationOpen, savedPhoneViewProfile, phoneViewProfile])

  const choosePC = useCallback(async () => {
    cancelCalibrationDraft()
    releasePhoneHeadset()
    setPhoneViewProfile((current) => ({ ...current, mode: PHONE_VIEW_MODES.MAGIC_WINDOW }))
    setPhoneMotionStatus({ status: 'inactive', detail: '' })
    await xrControllerRef.current?.select('pc')
  }, [releasePhoneHeadset, cancelCalibrationDraft])

  const enterPhoneHeadset = useCallback(async () => {
    cancelCalibrationDraft()
    void enablePhoneMotion()
    const attempt = ++phoneHeadsetAttempt.current
    setMode('phone')
    setPhoneCalibrationOpen(false)
    setPhoneViewProfile((current) => ({ ...current, mode: PHONE_VIEW_MODES.HEADSET_STEREO }))
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen()
        phoneFullscreen.current = true
      }
      if (attempt !== phoneHeadsetAttempt.current) { releasePhoneHeadset(); return }
      if (phoneFullscreen.current) await screen.orientation?.lock?.('landscape')
    } catch {}
  }, [enablePhoneMotion, releasePhoneHeadset, cancelCalibrationDraft])

  useEffect(() => () => releasePhoneHeadset(), [releasePhoneHeadset])

  const openPhoneCalibration = useCallback(() => {
    setSavedPhoneViewProfile(phoneViewProfile)
    setPhoneCalibrationOpen(true)
  }, [phoneViewProfile])

  const previewPhoneProfile = useCallback((profile) => {
    setPhoneViewProfile(profile)
  }, [])

  const savePhoneProfile = useCallback((profile) => {
    const saved = savePhoneViewProfile(profile)
    setSavedPhoneViewProfile(saved)
    setPhoneViewProfile(saved)
    setPhoneCalibrationOpen(false)
  }, [])

  const cancelPhoneCalibration = useCallback(() => {
    setPhoneViewProfile(savedPhoneViewProfile)
    setPhoneCalibrationOpen(false)
  }, [savedPhoneViewProfile])

  const handlePlaceHotspot = useCallback(({ yaw, pitch }) => {
    if (!editMode || !placingHotspot) return
    onHotspotCreate?.({ yaw, pitch })
  }, [editMode, placingHotspot, onHotspotCreate])

  const overlays = useViewerOverlays({
    enabled: !editMode && showModeBar && !immersiveOverlay,
    busy: Boolean(phoneCalibrationOpen || inspection || info || !sceneReady),
    revealKey: `${scene?.id}:${guideEntry}:${mode}`,
  })

  if (!scene) return <div className="viewer-empty">No scene selected.</div>

  return (
    <InteractionProvider
      onBack={back}
      onNext={activeGuide ? guideNext : undefined}
      onPrevious={activeGuide ? guidePrevious : undefined}
      onHome={activeGuide ? exitGuide : undefined}
    >
      <div ref={overlays.root} className="viewer-surface">
      <KeyboardInput />
      <RemoteInputAdapter />

      {showModeBar && (
        <ViewerModeBar
          mode={mode}
          onPC={choosePC}
          onPhone={choosePhone}
          onVR={startVR}
          vrAvailable={capabilities.immersiveVRSupported}
          vrChecking={capabilities.immersiveVRChecking}
          vrPending={vrPending}
          vrReason={capabilities.immersiveVRReason}
          phoneHeadset={phoneHeadset}
          onEnterPhoneHeadset={enterPhoneHeadset}
          onExitPhoneHeadset={exitPhoneHeadset}
          onOpenPhoneCalibration={openPhoneCalibration}
          phoneMotionStatus={phoneMotionStatus}
          onRecenterPhone={recenterPhone}
          xrTracking={xrTracking}
          spatialAvailable={Boolean(scene?.spatial?.roomUrl) && !spatialRoomFailed}
        />
      )}

      <PhoneCalibrationPanel
        open={mode === 'phone' && phoneCalibrationOpen}
        profile={phoneViewProfile}
        onPreview={previewPhoneProfile}
        onSave={savePhoneProfile}
        onCancel={cancelPhoneCalibration}
        onRecenter={recenterPhone}
        motionStatus={phoneMotionStatus}
      />

      <Canvas
        className="viewer-canvas"
        onPointerMissed={overlays.onPointerMissed}
        camera={{ position: [0, 0, 0.01], fov: 75, near: 0.01, far: 200 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={mode === 'phone' ? [1, phoneHeadset ? 1.25 : 1.5] : [1, 2]}
      >
        <SceneContent
          scene={scene}
          editorFocusRequest={editorFocusRequest}
          editorViewRef={editorViewRef}
          editorHighlightedHotspotId={editorHighlightedHotspotId}
          onHotspotActivate={activateHotspot}
          editMode={editMode}
          placingHotspot={placingHotspot}
          onPlaceHotspot={handlePlaceHotspot}
          selectedHotspotId={selectedHotspotId}
          onSelectHotspot={onSelectHotspot}
          mode={mode}
          phoneHeadset={phoneHeadset}
          vrPending={vrPending}
          phoneViewProfile={phoneViewProfile}
          phoneMotionActive={phoneMotionStatus.status === 'active'}
          calibratingPhone={phoneCalibrationOpen}
          phoneMotionPermission={phoneMotionPermission}
          onPhoneMotionStatus={setPhoneMotionStatus}
          phoneOrientationRef={phoneOrientationRef}
          spatialSceneRef={spatialSceneRef}
          spatialRoomFailed={spatialRoomFailed}
          onSpatialStatus={handleSpatialStatus}
          panoramaAttempt={panoramaAttempt}
          panoramaReady={panoramaReady}
          onPanoramaStatus={handlePanoramaStatus}
          onRendererReady={(renderer, camera) => { rendererRef.current = renderer; cameraRef.current = camera }}
          inspection={inspection}
          info={info}
          inspectorRef={inspectorRef}
          onInspectorClose={closeInspection}
          onInspectorStatus={setInspectorStatus}
          onInfoClose={() => setInfo(null)}
          guide={activeGuide}
          guideStep={guideStepEntered ? guideStep : null}
          guideStepIndex={guideStepIndex}
          guideEntry={guideEntry}
          onGuidePrevious={guidePrevious}
          onGuideNext={guideNext}
          onGuideExit={exitGuide}
          xrTracking={xrTracking}
          onXRTrackingChange={setXRTracking}
        />
      </Canvas>

      {inspection && !immersiveOverlay && <ProductInspection ref={inspectorRef} inspection={inspection} onClose={closeInspection} onStatusChange={setInspectorStatus} />}

      {!usingSpatial && !waitingForTracking && !panoramaReady && (
        <div className={`viewer-media-status${media?.state === 'error' ? ' viewer-media-status--error' : ''}`}
          role={media?.state === 'error' ? 'alert' : 'status'}>
          {media?.message || 'Loading panorama…'}
          {media?.state === 'error' && (
            <button type="button" onClick={() => {
              handlePanoramaStatus({ key: panoramaKey(scene), state: 'loading' })
              setPanoramaAttempt((attempt) => attempt + 1)
            }}>Retry panorama</button>
          )}
        </div>
      )}

      {!editMode && !inspection && !info && <GuideLauncher
        guides={guides}
        activeGuide={activeGuide}
        onStart={startGuide}
      />}

      {!immersiveOverlay && (
        <GuideOverlay
          guide={activeGuide}
          step={guideStep}
          stepIndex={guideStepIndex}
          onPrevious={guidePrevious}
          onNext={guideNext}
          onExit={exitGuide}
        />
      )}

      <InfoOverlay
        info={immersiveOverlay ? null : info}
        onClose={() => setInfo(null)}
      />
      {overlayChildren}
      </div>
    </InteractionProvider>
  )
}
