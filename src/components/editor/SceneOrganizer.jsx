import React, { useEffect, useRef, useState } from 'react'
import SceneMapDialog from './SceneNavigationMap'
import HomeIcon from '../ui/HomeIcon'

export function moveScene(scenes, fromId, toId) {
  const from = scenes.findIndex((scene) => scene.id === fromId)
  const to = scenes.findIndex((scene) => scene.id === toId)
  if (from < 0 || to < 0 || from === to) return scenes

  const next = [...scenes]
  const [scene] = next.splice(from, 1)
  next.splice(to, 0, scene)
  return next
}

export default function SceneOrganizer({
  scenes, currentSceneId, startSceneId, optionsRequest, onStartSceneChange, onNavigate, onScenesChange, onAddScene,
}) {
  const [query, setQuery] = useState('')
  const [showMap, setShowMap] = useState(false)
  const [draggedId, setDraggedId] = useState(null)
  const handledOptionsRequest = useRef(null)
  const search = query.trim().toLowerCase()
  const visible = scenes.filter((scene) => `${scene.title || ''} ${scene.group || ''}`.toLowerCase().includes(search))

  useEffect(() => {
    if (!optionsRequest || handledOptionsRequest.current === optionsRequest.id) return
    if (query) {
      setQuery('')
      return
    }

    handledOptionsRequest.current = optionsRequest.id
    const options = document.getElementById(`studio-scene-options-${optionsRequest.sceneId}`)
    if (options) {
      options.open = true
      options.querySelector('summary')?.focus()
    }
  }, [optionsRequest, query])

  function runSceneAction(event, action) {
    const options = event.currentTarget.closest('details')
    action()
    if (options) {
      options.open = false
      requestAnimationFrame(() => options.querySelector('summary')?.focus())
    }
  }

  function moveBy(sceneId, offset) {
    onScenesChange((previous) => {
      const index = previous.findIndex((scene) => scene.id === sceneId)
      return moveScene(previous, sceneId, previous[index + offset]?.id)
    })
  }

  return (
    <nav className="scene-browser" aria-label="Scenes">
      <div className="studio-pane-heading">
        <h2>Scenes <span>{scenes.length}</span></h2>
        <button className="primary" onClick={() => { setQuery(''); onAddScene() }}>+ Add scene</button>
      </div>
      {(scenes.length > 4 || query) && (
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a scene" aria-label="Find a scene" />
      )}
      <div className="scene-card-list">
        {visible.map((scene, index) => (
          <article
            key={scene.id}
            draggable={!search}
            className={`scene-card${scene.id === currentSceneId ? ' is-current' : ''}`}
            onDragStart={() => setDraggedId(scene.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => { if (draggedId) event.preventDefault() }}
            onDrop={(event) => {
              event.preventDefault()
              onScenesChange((previous) => moveScene(previous, draggedId, scene.id))
              setDraggedId(null)
            }}
          >
            <button type="button" className="scene-card__select" aria-current={scene.id === currentSceneId ? 'true' : undefined} onClick={() => onNavigate(scene.id)}>
              <span
                className="scene-card__thumb"
                style={scene.image ? { backgroundImage: `url(${JSON.stringify(/^\/(uploads|demo)\//.test(scene.image) ? `/api/assets/thumbnail?url=${encodeURIComponent(scene.image)}` : scene.image)})` } : undefined}
                aria-hidden="true"
              >
                {scene.image ? '' : scene.panorama?.manifestUrl ? '360°' : index + 1}
              </span>
              <span className="scene-card__body">
                <strong>{scene.title || 'Untitled scene'}</strong>
                {scene.group && <small>{scene.group}</small>}
              </span>
              {scene.id === startSceneId && <span className="scene-home" aria-label="Starting scene" title="Starting scene"><HomeIcon /></span>}
            </button>
            <details data-menu className="scene-card__options" id={`studio-scene-options-${scene.id}`} name="studio-scene-options">
              <summary aria-label={`Options for ${scene.title || 'untitled scene'}`} title="Scene options">⋯</summary>
              <div className="scene-card__actions">
                <button
                  type="button"
                  disabled={scene.id === startSceneId}
                  onClick={(event) => runSceneAction(event, () => onStartSceneChange(scene.id))}
                >
                  {scene.id === startSceneId ? 'Starting scene' : 'Set as starting scene'}
                </button>
                <button
                  type="button"
                  disabled={scene.id === scenes[0]?.id}
                  onClick={(event) => runSceneAction(event, () => moveBy(scene.id, -1))}
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={scene.id === scenes.at(-1)?.id}
                  onClick={(event) => runSceneAction(event, () => moveBy(scene.id, 1))}
                >
                  Move down
                </button>
              </div>
            </details>
          </article>
        ))}
      </div>
      {!visible.length && <p className="muted">{scenes.length ? 'No matching scenes.' : 'Add a scene to begin your tour.'}</p>}
      {scenes.length > 0 && <button className="studio-map" onClick={() => setShowMap(true)}>Scene map</button>}
      {showMap && (
        <SceneMapDialog
          scenes={scenes}
          currentSceneId={currentSceneId}
          startSceneId={startSceneId}
          onStartSceneChange={onStartSceneChange}
          onNavigate={onNavigate}
          onScenesChange={onScenesChange}
          onClose={() => setShowMap(false)}
        />
      )}
    </nav>
  )
}
