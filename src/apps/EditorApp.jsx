import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useProjectDraft } from '../hooks/useProjectDraft'
import Viewer from '../components/Viewer'
import LoginModal from '../components/LoginModal'
import EditorOverlay from '../components/editor/EditorOverlay'
import PanoramaMasterUpload from '../components/editor/PanoramaMasterUpload'

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
    updateGuides,
    updateTitle,
    updateStartScene,
    saveDraft,
    publish,
    uploadAsset,
  } = draft

  const [sceneId, setSceneId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!scenes.length) return
    if (!sceneId || !scenes.some((scene) => scene.id === sceneId)) {
      setSceneId(project?.startSceneId || scenes[0].id)
    }
  }, [project?.startSceneId, sceneId, scenes])

  const navigate = useCallback((id) => {
    setSceneId(id)
    setSelected(null)
  }, [])

  const createHotspot = useCallback(({ yaw, pitch }) => {
    const id = `hotspot-${Date.now()}`
    updateScenes((previous) => previous.map((scene) => (
      scene.id === sceneId
        ? {
            ...scene,
            hotspots: [
              ...(scene.hotspots || []),
              {
                id,
                label: 'Hotspot',
                size: 1,
                position: { yaw, pitch },
                actions: [],
              },
            ],
          }
        : scene
    )))
    setSelected(id)
    setPlacing(false)
  }, [sceneId, updateScenes])

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
      await saveDraft()
    } catch (saveFailure) {
      setSaveError(saveFailure.message)
    }
  }

  async function handlePublish() {
    setSaveError('')
    try {
      await publish()
    } catch (publishFailure) {
      setSaveError(publishFailure.message)
    }
  }

  if (loading) return <div className="app-loading">Loading {projectId}...</div>
  if (error) return <div className="app-loading error-text">{error}</div>
  if (!sceneId || !project) return null

  return (
    <div className="app">
      <Viewer
        sceneId={sceneId}
        onNavigate={navigate}
        scenes={scenes}
        guides={guides}
        editMode={auth.isEditor}
        placingHotspot={auth.isEditor && placing}
        selectedHotspotId={selected}
        onSelectHotspot={setSelected}
        onHotspotCreate={createHotspot}
      />

      {!auth.isEditor && (
        <button className="lock-btn" onClick={() => setShowLogin(true)}>
          Editor
        </button>
      )}

      {auth.isEditor && (
        <>
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
            onPublishProject={handlePublish}
            scenes={scenes}
            currentSceneId={sceneId}
            startSceneId={project.startSceneId}
            onStartSceneChange={updateStartScene}
            onNavigate={navigate}
            onScenesChange={updateScenes}
            placingHotspot={placing}
            onTogglePlacing={() => setPlacing((value) => !value)}
            saveError={saveError}
            selectedHotspotId={selected}
            onSelectHotspot={setSelected}
            uploadAsset={uploadAsset}
            guides={guides}
            onGuidesChange={updateGuides}
          />
          <PanoramaMasterUpload onUseProcessed={usePanorama} />
        </>
      )}

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}
