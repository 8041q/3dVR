import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useScenes } from '../hooks/useScenes'
import { useGuides } from '../hooks/useGuides'
import Viewer from '../components/Viewer'
import LoginModal from '../components/LoginModal'
import EditorOverlay from '../components/editor/EditorOverlay'
import PanoramaMasterUpload from '../components/editor/PanoramaMasterUpload'

export default function EditorApp({ projectId = 'default' }) {
  const auth = useAuth()
  const {
    guides,
    loading: guidesLoading,
    error: guidesError,
    updateGuides,
    saveGuides,
  } = useGuides()
  const {
    scenes,
    loading,
    error,
    updateScenes,
    saveScenes,
    uploadAsset,
  } = useScenes()
  const [sceneId, setSceneId] = useState(null)
  const [selected, setSelected] = useState(null)
  const [placing, setPlacing] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (scenes.length && !sceneId) setSceneId(scenes[0].id)
  }, [scenes, sceneId])

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
      scene.id === sceneId ? { ...scene, panorama } : scene
    )))
  }, [sceneId, updateScenes])

  async function save() {
    setSaving(true)
    setSaveError('')
    try {
      await Promise.all([saveScenes(scenes), saveGuides(guides)])
    } catch (saveFailure) {
      setSaveError(saveFailure.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading || guidesLoading) return <div className="app-loading">Loading {projectId}...</div>
  if (error || guidesError) return <div className="app-loading error-text">{error || guidesError}</div>
  if (!sceneId) return null

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
            scenes={scenes}
            currentSceneId={sceneId}
            onNavigate={navigate}
            onScenesChange={updateScenes}
            placingHotspot={placing}
            onTogglePlacing={() => setPlacing((value) => !value)}
            saving={saving}
            saveError={saveError}
            onSave={save}
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
