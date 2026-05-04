import React, { useCallback, useRef } from 'react'
import SceneList from './SceneList'
import HotspotPanel from './HotspotPanel'
import EditorToolbar from './EditorToolbar'
import { generateId } from '../../utils/coords'

export default function EditorOverlay({
  scenes,
  currentSceneId,
  onNavigate,
  onScenesChange,
  uploadImage,
  placingHotspot,
  onTogglePlacing,
  saving,
  saveError,
  onSave,
  selectedHotspotId,
  onSelectHotspot,
}) {
  const currentScene = scenes.find((s) => s.id === currentSceneId)
  const selectedHotspot = currentScene?.hotspots?.find((h) => h.id === selectedHotspotId) ?? null

  function updateHotspot(updatedHotspot) {
    const updated = scenes.map((scene) => {
      if (scene.id !== currentSceneId) return scene
      return {
        ...scene,
        hotspots: scene.hotspots.map((h) => h.id === updatedHotspot.id ? updatedHotspot : h),
      }
    })
    onScenesChange(updated)
  }

  function deleteHotspot(hotspotId) {
    const updated = scenes.map((scene) => {
      if (scene.id !== currentSceneId) return scene
      return { ...scene, hotspots: scene.hotspots.filter((h) => h.id !== hotspotId) }
    })
    onScenesChange(updated)
    onSelectHotspot(null)
  }

  // Called from Viewer when user clicks the panorama in placing mode
  const handlePlaceHotspot = useCallback(({ yaw, pitch }) => {
    const newHotspot = {
      id: generateId('h'),
      label: 'New Hotspot',
      position: { yaw, pitch },
      target: '',
      shape: 'sphere',
      size: 1,
    }
    const updated = scenes.map((scene) => {
      if (scene.id !== currentSceneId) return scene
      return { ...scene, hotspots: [...(scene.hotspots || []), newHotspot] }
    })
    onScenesChange(updated)
    onSelectHotspot(newHotspot.id)
    onTogglePlacing() // turn off placing mode after drop
  }, [scenes, currentSceneId, onScenesChange, onTogglePlacing])

  return (
    <>
      <SceneList
        scenes={scenes}
        currentSceneId={currentSceneId}
        onNavigate={onNavigate}
        onScenesChange={onScenesChange}
        uploadImage={uploadImage}
      />

      <EditorToolbar
        placingHotspot={placingHotspot}
        onTogglePlacing={onTogglePlacing}
        saving={saving}
        saveError={saveError}
        onSave={onSave}
      />

      {selectedHotspot && (
        <HotspotPanel
          hotspot={selectedHotspot}
          scenes={scenes}
          currentSceneId={currentSceneId}
          onUpdate={updateHotspot}
          onDelete={deleteHotspot}
          onClose={() => onSelectHotspot(null)}
        />
      )}

      {/* Expose the place handler so Viewer can call it via prop threading */}
      <PlacingProxy onPlace={handlePlaceHotspot} />
    </>
  )
}

// Tiny helper to make the place callback accessible via a DOM custom event (avoids prop-drilling into Canvas)
function PlacingProxy({ onPlace }) {
  React.useEffect(() => {
    function handler(e) { onPlace(e.detail) }
    window.addEventListener('vr:placeHotspot', handler)
    return () => window.removeEventListener('vr:placeHotspot', handler)
  }, [onPlace])
  return null
}
