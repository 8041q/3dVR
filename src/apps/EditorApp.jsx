import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useProjectDraft } from '../hooks/useProjectDraft'
import Viewer from '../components/Viewer'
import LoginModal from '../components/LoginModal'
import EditorOverlay from '../components/editor/EditorOverlay'
import { cleanupDraftPreviews, createDraftPreview } from '../preview/draftPreview'
import { ACTION_TYPES, createAction } from '../actions/actionTypes'

export default function EditorApp({ projectId = 'default' }) {
  const auth = useAuth()
  const draft = useProjectDraft(projectId)
  const {
    project,
    scenes,
    guides,
    meta,
    loading,
    error,
    dirty,
    saving,
    publishing,
    updateScenes,
    updateProject,
    updateGuides,
    updateTitle,
    updateStartScene,
    saveDraft,
    publish,
    uploadAsset,
    canUndo, canRedo, undo, redo,
  } = draft

  const [sceneId, setSceneId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [placing, setPlacing] = useState(null)
  const [focusRequest, setFocusRequest] = useState(null)
  const viewRef = useRef({ yaw: 0, pitch: 0 })
  const [showLogin, setShowLogin] = useState(!auth.isEditor)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!scenes.length) return
    if (!sceneId || !scenes.some((scene) => scene.id === sceneId)) {
      setSceneId(scenes.some((scene) => scene.id === project?.startSceneId) ? project.startSceneId : scenes[0].id)
    }
  }, [project?.startSceneId, sceneId, scenes])

  const navigate = useCallback((id) => {
    setSceneId(id)
    setSelected(null)
    setPlacing(null)
  }, [])

  const createHotspot = useCallback(({ yaw, pitch }) => {
    if (!placing) return
    if (placing.moveId) {
      updateScenes((previous) => previous.map((scene) => scene.id === sceneId ? {
        ...scene, hotspots: (scene.hotspots || []).map((hotspot) => hotspot.id === placing.moveId ? { ...hotspot, position: { yaw, pitch } } : hotspot),
      } : scene))
      setPlacing(null)
      return
    }
    const id = crypto.randomUUID()
    const action = createAction(placing.type || ACTION_TYPES.NAVIGATE_SCENE)
    if (action.type === ACTION_TYPES.NAVIGATE_SCENE) action.sceneId = placing.sceneId || ''
    const destination = scenes.find((scene) => scene.id === action.sceneId)
    const labels = { 'show-info': 'Information', 'inspect-model': 'Explore product', 'start-guide': 'Start tour', 'open-url': 'Open website', 'play-room-animation': 'Room animation' }
    updateScenes((previous) => previous.map((scene) => (
      scene.id === sceneId
        ? {
            ...scene,
            hotspots: [
              ...(scene.hotspots || []),
              {
                id,
                label: destination ? `Go to ${destination.title}` : labels[action.type] || 'Go to scene',
                size: 1,
                position: { yaw, pitch },
                style: {
                  preset: action.type === ACTION_TYPES.SHOW_INFO ? 'info' : action.type === ACTION_TYPES.INSPECT_MODEL ? 'product' : 'navigation',
                  color: '#f5f7fa',
                  opacity: 0.92,
                },
                actions: [action],
              },
            ],
          }
        : scene
    )))
    setSelected(id)
    setPlacing(null)
  }, [placing, sceneId, scenes, updateScenes])

  const focusHotspot = useCallback((id, targetSceneId = sceneId) => {
    const hotspot = scenes.find((scene) => scene.id === targetSceneId)?.hotspots?.find((item) => item.id === id)
    if (hotspot) setFocusRequest({ id: crypto.randomUUID(), ...hotspot.position })
  }, [sceneId, scenes])

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    const keydown = (event) => {
      if (event.key === 'Escape') setPlacing(null)
      if (!auth.isEditor || !(event.ctrlKey || event.metaKey) || saving || publishing) return
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleSave()
      }
      const textEditing = event.target.closest?.('input, textarea, select, [contenteditable="true"]')
      if (!textEditing && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  const usePanorama = useCallback((panorama) => {
    updateScenes((previous) => previous.map((scene) => (
      scene.id === sceneId
        ? { ...scene, panorama, image: scene.image || '' }
        : scene
    )))
  }, [sceneId, updateScenes])

  async function handleSave() {
    setSaveError('')
    try {
      return await saveDraft()
    } catch (saveFailure) {
      setSaveError(saveFailure.message)
      return null
    }
  }

  function handlePreview() {
    if (!project) return false
    setSaveError('')
    try {
      cleanupDraftPreviews()
      const key = createDraftPreview(project)
      const url = `/preview/${encodeURIComponent(projectId)}?key=${encodeURIComponent(key)}`
      const previewWindow = window.open(url, '_blank')
      if (previewWindow) previewWindow.opener = null
      else window.location.assign(url)
      return true
    } catch (previewFailure) {
      setSaveError(previewFailure.message || 'Could not create draft preview')
      return false
    }
  }

  async function handlePublish() {
    setSaveError('')
    try {
      return await publish()
    } catch (publishFailure) {
      setSaveError(publishFailure.message)
      throw publishFailure
    }
  }

  if (loading) return <div className="app-loading">Loading {projectId}...</div>
  if (error) return <div className="app-loading error-text">{error}</div>
  if (!sceneId || !project) return null

  return (
    <div className="app editor-app">
      <Viewer
        sceneId={sceneId}
        onNavigate={navigate}
        scenes={scenes}
        guides={guides}
        editMode={auth.isEditor}
        placingHotspot={auth.isEditor && Boolean(placing)}
        selectedHotspotId={selected}
        onSelectHotspot={setSelected}
        onHotspotCreate={createHotspot}
        editorFocusRequest={focusRequest}
        editorViewRef={viewRef}
        showModeBar={!auth.isEditor}
      />

      {!auth.isEditor && (
        <button className="lock-btn" onClick={() => setShowLogin(true)}>
          Sign in to edit
        </button>
      )}

      {auth.isEditor && (
        <EditorOverlay
          projectId={projectId}
          projectTitle={project.title}
          projectMeta={meta}
          projectDirty={dirty}
          projectSaving={saving}
          projectPublishing={publishing}
          authToken={auth.token}
          onProjectTitleChange={updateTitle}
          onSaveProject={handleSave}
          onPreviewProject={handlePreview}
          onPublishProject={handlePublish}
          scenes={scenes}
          currentSceneId={sceneId}
          startSceneId={project.startSceneId}
          onStartSceneChange={updateStartScene}
          onNavigate={navigate}
          onScenesChange={updateScenes}
          onEditProject={updateProject}
          placingHotspot={Boolean(placing)}
          onTogglePlacing={(config) => setPlacing(config)}
          onCancelPlacing={() => setPlacing(null)}
          onRepositionHotspot={(moveId) => setPlacing({ moveId })}
          onFocusHotspot={focusHotspot}
          onResetView={() => setFocusRequest({ id: crypto.randomUUID(), yaw: 0, pitch: 0, fov: 75 })}
          onReadView={() => viewRef.current}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          saveError={saveError}
          selectedHotspotId={selected}
          onSelectHotspot={setSelected}
          uploadAsset={uploadAsset}
          guides={guides}
          onGuidesChange={updateGuides}
          onUseProcessedPanorama={usePanorama}
        />
      )}

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}
