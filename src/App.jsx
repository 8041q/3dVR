import React, { useCallback, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useScenes } from './hooks/useScenes'
import Viewer from './components/Viewer'
import LoginModal from './components/LoginModal'
import EditorOverlay from './components/editor/EditorOverlay'

function AppInner() {
  const { isEditor } = useAuth()
  const { scenes, loading, error, saveScenes, updateScenes, uploadImage } = useScenes()

  const [sceneId, setSceneId] = useState(null)
  const [selectedHotspotId, setSelectedHotspotId] = useState(null)
  const [mode, setMode] = useState('pc')
  const [showLogin, setShowLogin] = useState(false)
  const [placingHotspot, setPlacingHotspot] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (scenes.length > 0 && !sceneId) setSceneId(scenes[0].id)
  }, [scenes, sceneId])

  const handleNavigate = useCallback((id) => {
    setSceneId(id)
    setSelectedHotspotId(null)
  }, [])

  const handleScenesChange = useCallback((updated) => {
    updateScenes(updated)
  }, [updateScenes])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveError('')
    try {
      await saveScenes(scenes)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }, [saveScenes, scenes])

  const handleHotspotMove = useCallback((hotspotId, yaw, pitch) => {
    updateScenes((prev) => prev.map((scene) => {
      if (scene.id !== sceneId) return scene
      return {
        ...scene,
        hotspots: (scene.hotspots ?? []).map((h) =>
          h.id !== hotspotId ? h : { ...h, position: { ...h.position, yaw, pitch } }
        ),
      }
    }))
  }, [updateScenes, sceneId])

  if (loading) return <div className="app-loading">Loading scenes…</div>
  if (error) return <div className="app-loading app-loading--error">Failed to load scenes: {error}</div>
  if (!sceneId) return null

  return (
    <div className="app">
      <div className="mode-bar">
        <button onClick={() => setMode('pc')} disabled={mode === 'pc'}>PC</button>
        <button onClick={() => setMode('phone')} disabled={mode === 'phone'}>Phone</button>
        <button onClick={() => setMode('vr')} disabled={mode === 'vr'}>VR</button>
      </div>

      {!isEditor && (
        <button className="lock-btn" title="Editor login" onClick={() => setShowLogin(true)}>🔒</button>
      )}

      <Viewer
        sceneId={sceneId}
        onNavigate={handleNavigate}
        scenes={scenes}
        mode={mode}
        editMode={isEditor}
        placingHotspot={isEditor && placingHotspot}
        selectedHotspotId={selectedHotspotId}
        onSelectHotspot={setSelectedHotspotId}
        onHotspotMove={handleHotspotMove}
      />

      {isEditor && (
        <EditorOverlay
          scenes={scenes}
          currentSceneId={sceneId}
          onNavigate={handleNavigate}
          onScenesChange={handleScenesChange}
          uploadImage={uploadImage}
          placingHotspot={placingHotspot}
          onTogglePlacing={() => setPlacingHotspot((v) => !v)}
          saving={saving}
          saveError={saveError}
          onSave={handleSave}
          selectedHotspotId={selectedHotspotId}
          onSelectHotspot={setSelectedHotspotId}
        />
      )}

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
