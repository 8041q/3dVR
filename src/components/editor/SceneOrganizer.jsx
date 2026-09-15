import React, { useMemo, useState } from 'react'
import SceneMapDialog from './SceneMapDialog'

function moveItem(items, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

function sceneThumb(scene) {
  return scene.image || ''
}

export default function SceneOrganizer({
  scenes,
  currentSceneId,
  startSceneId,
  onNavigate,
  onScenesChange,
  onAddScene,
  onRemoveScene,
  onStartSceneChange,
  patchScene,
}) {
  const [newTitle, setNewTitle] = useState('New scene')
  const [query, setQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [showMap, setShowMap] = useState(false)
  const [draggedId, setDraggedId] = useState(null)

  const currentScene = scenes.find((scene) => scene.id === currentSceneId)
  const groups = useMemo(() => [...new Set(
    scenes.map((scene) => String(scene.group || '').trim()).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b)), [scenes])

  const filteredScenes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return scenes.filter((scene) => {
      if (groupFilter !== 'all' && String(scene.group || '') !== groupFilter) return false
      if (!needle) return true
      return `${scene.title || ''} ${scene.group || ''}`.toLowerCase().includes(needle)
    })
  }, [groupFilter, query, scenes])

  function addScene() {
    onAddScene(newTitle.trim() || 'New scene')
    setNewTitle('New scene')
  }

  return (
    <div className="scene-organizer">
      <div className="editor-context-strip">
        <span>Current scene</span>
        <strong>{currentScene?.title || currentSceneId}</strong>
      </div>

      <div className="scene-organizer__toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a scene"
          aria-label="Find a scene"
        />
        <button type="button" onClick={() => setShowMap(true)}>Open map</button>
      </div>

      {groups.length > 0 && (
        <div className="scene-organizer__groups" aria-label="Scene groups">
          <button
            type="button"
            className={groupFilter === 'all' ? 'active' : ''}
            onClick={() => setGroupFilter('all')}
          >
            All
          </button>
          {groups.map((group) => (
            <button
              key={group}
              type="button"
              className={groupFilter === group ? 'active' : ''}
              onClick={() => setGroupFilter(group)}
            >
              {group}
            </button>
          ))}
        </div>
      )}

      <div className="scene-card-list">
        {filteredScenes.map((scene) => (
          <article
            key={scene.id}
            draggable
            className={`scene-card${scene.id === currentSceneId ? ' active' : ''}`}
            onDragStart={() => setDraggedId(scene.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const fromIndex = scenes.findIndex((item) => item.id === draggedId)
              const toIndex = scenes.findIndex((item) => item.id === scene.id)
              if (fromIndex >= 0 && toIndex >= 0) onScenesChange(moveItem(scenes, fromIndex, toIndex))
              setDraggedId(null)
            }}
          >
            <button type="button" className="scene-card__select" onClick={() => onNavigate(scene.id)}>
              <span
                className="scene-card__thumb"
                style={sceneThumb(scene) ? { backgroundImage: `url(${sceneThumb(scene)})` } : undefined}
              >
                {!sceneThumb(scene) && scene.panorama?.manifestUrl ? '360' : ''}
              </span>
              <span className="scene-card__body">
                <strong>{scene.title || scene.id}</strong>
                <small>{scene.group || 'Ungrouped'}</small>
              </span>
              {scene.id === startSceneId && <em>Start</em>}
            </button>
          </article>
        ))}
      </div>

      {filteredScenes.length === 0 && (
        <div className="editor-empty-state">No scenes match this filter.</div>
      )}

      <div className="inline-form scene-organizer__add">
        <input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addScene()
          }}
          placeholder="New scene name"
        />
        <button type="button" onClick={addScene}>Add</button>
      </div>

      {currentScene && (
        <div className="editor-inspector-card scene-organizer__inspector">
          <div className="editor-subheading">Selected scene</div>
          <label>
            Title
            <input
              value={currentScene.title || ''}
              onChange={(event) => patchScene({ title: event.target.value })}
            />
          </label>
          <label>
            Group / area
            <input
              value={currentScene.group || ''}
              list="scene-groups"
              onChange={(event) => patchScene({ group: event.target.value })}
              placeholder="Ground floor, Bedrooms, Pavilion A..."
            />
          </label>
          <datalist id="scene-groups">
            {groups.map((group) => <option value={group} key={group} />)}
          </datalist>
          <label>
            Panorama URL
            <input
              value={currentScene.image || ''}
              onChange={(event) => patchScene({ image: event.target.value })}
            />
          </label>
          <div className="muted">
            High-resolution panorama: {currentScene.panorama?.manifestUrl ? 'configured' : 'not configured'}
          </div>
          <div className="button-row">
            <button
              type="button"
              onClick={() => onStartSceneChange(currentSceneId)}
              disabled={startSceneId === currentSceneId}
            >
              {startSceneId === currentSceneId ? 'Start scene' : 'Set as start scene'}
            </button>
            <button
              type="button"
              className="danger"
              onClick={onRemoveScene}
              disabled={scenes.length <= 1}
            >
              Delete scene
            </button>
          </div>
        </div>
      )}

      {showMap && (
        <SceneMapDialog
          scenes={scenes}
          currentSceneId={currentSceneId}
          startSceneId={startSceneId}
          onNavigate={onNavigate}
          onScenesChange={onScenesChange}
          onClose={() => setShowMap(false)}
        />
      )}
    </div>
  )
}
