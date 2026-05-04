import React, { useState } from 'react'
import AddSceneModal from './AddSceneModal'

export default function SceneList({ scenes, currentSceneId, onNavigate, onScenesChange, uploadImage }) {
  const [showAdd, setShowAdd] = useState(false)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  function startRename(scene) {
    setRenamingId(scene.id)
    setRenameValue(scene.title)
  }

  function commitRename(scene) {
    if (!renameValue.trim()) { setRenamingId(null); return }
    const updated = scenes.map((s) => s.id === scene.id ? { ...s, title: renameValue.trim() } : s)
    onScenesChange(updated)
    setRenamingId(null)
  }

  function handleAdd(newScene) {
    onScenesChange([...scenes, newScene])
    onNavigate(newScene.id)
  }

  function handleDelete(scene) {
    if (!confirm(`Delete scene "${scene.title}"? All its hotspots will be removed.`)) return
    const updated = scenes.filter((s) => s.id !== scene.id)
    onScenesChange(updated)
    if (currentSceneId === scene.id && updated.length > 0) onNavigate(updated[0].id)
  }

  return (
    <>
      <aside className="scene-list">
        <div className="scene-list__header">
          <span className="scene-list__title">Scenes</span>
          <button className="btn btn--primary btn--sm" onClick={() => setShowAdd(true)}>+ Add</button>
        </div>
        <ul className="scene-list__items">
          {scenes.map((scene) => (
            <li
              key={scene.id}
              className={`scene-list__item${scene.id === currentSceneId ? ' scene-list__item--active' : ''}`}
              onClick={() => onNavigate(scene.id)}
            >
              <div
                className="scene-list__thumb"
                style={{ backgroundImage: scene.src ? `url(${scene.src})` : undefined }}
              />
              <div className="scene-list__info">
                {renamingId === scene.id ? (
                  <input
                    className="scene-list__rename-input"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(scene)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(scene)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="scene-list__name">{scene.title}</span>
                )}
              </div>
              <div className="scene-list__actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="icon-btn"
                  title="Rename"
                  onClick={() => startRename(scene)}
                >✏️</button>
                <button
                  className="icon-btn icon-btn--danger"
                  title="Delete scene"
                  onClick={() => handleDelete(scene)}
                  disabled={scenes.length <= 1}
                >🗑️</button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {showAdd && (
        <AddSceneModal
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
          uploadImage={uploadImage}
        />
      )}
    </>
  )
}
