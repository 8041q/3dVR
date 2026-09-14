import React, { useState } from 'react'
import HotspotActionEditor from './HotspotActionEditor'

export default function EditorOverlay({
  scenes,
  currentSceneId,
  onNavigate,
  onScenesChange,
  placingHotspot,
  onTogglePlacing,
  saving,
  saveError,
  onSave,
  selectedHotspotId,
  onSelectHotspot,
  uploadAsset,
}) {
  const scene = scenes.find((item) => item.id === currentSceneId)
  const hotspot = scene?.hotspots?.find((item) => item.id === selectedHotspotId)
  const [newTitle, setNewTitle] = useState('New scene')

  function patchScene(patch) {
    onScenesChange(scenes.map((item) => (
      item.id === currentSceneId ? { ...item, ...patch } : item
    )))
  }

  function patchHotspot(nextHotspot) {
    if (!hotspot) return
    patchScene({
      hotspots: (scene.hotspots || []).map((item) => (
        item.id === hotspot.id ? nextHotspot : item
      )),
    })
  }

  function addScene() {
    const id = `scene-${Date.now()}`
    onScenesChange([
      ...scenes,
      {
        id,
        title: newTitle.trim() || 'New scene',
        image: '/demo/lobby.jpg',
        hotspots: [],
      },
    ])
    onNavigate(id)
  }

  function removeScene() {
    if (scenes.length <= 1) return

    const nextScenes = scenes
      .filter((item) => item.id !== currentSceneId)
      .map((item) => ({
        ...item,
        hotspots: (item.hotspots || []).filter((itemHotspot) => (
          itemHotspot.targetSceneId !== currentSceneId &&
          !(itemHotspot.actions || []).some((action) => (
            action.type === 'navigate-scene' && action.sceneId === currentSceneId
          ))
        )),
      }))

    onScenesChange(nextScenes)
    onNavigate(nextScenes[0].id)
  }

  return (
    <aside className="editor-panel">
      <header>
        <strong>3DVR Editor</strong>
        <button onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </header>

      {saveError && <div className="error-text">{saveError}</div>}

      <section>
        <h3>Scenes</h3>
        <div className="scene-list">
          {scenes.map((item) => (
            <button
              key={item.id}
              className={item.id === currentSceneId ? 'active' : ''}
              onClick={() => onNavigate(item.id)}
            >
              {item.title || item.id}
            </button>
          ))}
        </div>
        <div className="inline-form">
          <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
          <button onClick={addScene}>Add</button>
        </div>
        <button className="danger" onClick={removeScene} disabled={scenes.length <= 1}>
          Delete scene
        </button>
      </section>

      {scene && (
        <section>
          <h3>Current scene</h3>
          <label>
            Title
            <input
              value={scene.title || ''}
              onChange={(event) => patchScene({ title: event.target.value })}
            />
          </label>
          <label>
            Legacy panorama URL
            <input
              value={scene.image || ''}
              onChange={(event) => patchScene({ image: event.target.value })}
            />
          </label>
          <div className="muted">
            Processed panorama: {scene.panorama?.manifestUrl || 'none'}
          </div>
        </section>
      )}

      <section>
        <h3>Hotspots</h3>
        <button className={placingHotspot ? 'active' : ''} onClick={onTogglePlacing}>
          {placingHotspot ? 'Click the panorama to place' : 'Place hotspot'}
        </button>

        <div className="hotspot-list">
          {(scene?.hotspots || []).map((item) => (
            <button
              key={item.id}
              className={item.id === selectedHotspotId ? 'active list-button' : 'list-button'}
              onClick={() => onSelectHotspot(item.id)}
            >
              {item.label || item.id}
            </button>
          ))}
        </div>

        {hotspot && (
          <div className="inspector">
            <label>
              Label
              <input
                value={hotspot.label || ''}
                onChange={(event) => patchHotspot({ ...hotspot, label: event.target.value })}
              />
            </label>
            <label>
              Size
              <input
                type="number"
                min="0.4"
                max="4"
                step="0.1"
                value={hotspot.size || 1}
                onChange={(event) => patchHotspot({
                  ...hotspot,
                  size: Number(event.target.value),
                })}
              />
            </label>

            <HotspotActionEditor
              hotspot={hotspot}
              scenes={scenes}
              currentSceneId={currentSceneId}
              uploadAsset={uploadAsset}
              onUpdate={patchHotspot}
            />

            <button
              className="danger"
              onClick={() => {
                patchScene({
                  hotspots: (scene.hotspots || []).filter((item) => item.id !== hotspot.id),
                })
                onSelectHotspot(null)
              }}
            >
              Delete hotspot
            </button>
          </div>
        )}
      </section>
    </aside>
  )
}
