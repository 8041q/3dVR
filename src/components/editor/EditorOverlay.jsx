import React, { useState } from 'react'
import { ACTION_TYPES, createAction, normalizeHotspotActions } from '../../actions/actionTypes'
import HotspotActionEditor from './HotspotActionEditor'
import GuideEditor from './GuideEditor'
import ProjectManager from './ProjectManager'
import AssetLibrary from './AssetLibrary'

export default function EditorOverlay({
  projectId,
  projectTitle,
  projectMeta,
  projectDirty,
  projectSaving,
  projectPublishing,
  authToken,
  onProjectTitleChange,
  onSaveProject,
  onPublishProject,
  scenes,
  currentSceneId,
  startSceneId,
  onStartSceneChange,
  onNavigate,
  onScenesChange,
  placingHotspot,
  onTogglePlacing,
  saveError,
  selectedHotspotId,
  onSelectHotspot,
  uploadAsset,
  guides = [],
  onGuidesChange,
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
            action.type === ACTION_TYPES.NAVIGATE_SCENE && action.sceneId === currentSceneId
          ))
        )),
      }))

    onScenesChange(nextScenes)
    onGuidesChange?.(guides.map((guide) => ({
      ...guide,
      steps: (guide.steps || []).filter((step) => step.sceneId !== currentSceneId),
    })))

    if (startSceneId === currentSceneId) onStartSceneChange(nextScenes[0].id)
    onNavigate(nextScenes[0].id)
  }

  function useImageAsset(asset) {
    patchScene({ image: asset.url, panorama: null })
  }

  function useModelAsset(asset) {
    if (!hotspot) return
    const actions = normalizeHotspotActions(hotspot)
    const inspection = createAction(ACTION_TYPES.INSPECT_MODEL)
    inspection.title = asset.name.replace(/\.[^.]+$/, '') || 'Product'
    inspection.modelUrl = asset.url
    patchHotspot({ ...hotspot, actions: [...actions, inspection] })
  }

  return (
    <aside className="editor-panel">
      <header className="editor-panel__header">
        <strong>3DVR Editor</strong>
      </header>

      <ProjectManager
        projectId={projectId}
        title={projectTitle}
        meta={projectMeta}
        dirty={projectDirty}
        saving={projectSaving}
        publishing={projectPublishing}
        token={authToken}
        onTitleChange={onProjectTitleChange}
        onSave={onSaveProject}
        onPublish={onPublishProject}
      />

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
              <span>{item.title || item.id}</span>
              {item.id === startSceneId && <small>Start</small>}
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
          <button
            onClick={() => onStartSceneChange(currentSceneId)}
            disabled={startSceneId === currentSceneId}
          >
            {startSceneId === currentSceneId ? 'Start scene' : 'Set as start scene'}
          </button>
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
              guides={guides}
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
                onGuidesChange?.(guides.map((guide) => ({
                  ...guide,
                  steps: (guide.steps || []).map((step) => (
                    step.sceneId === currentSceneId
                      ? {
                          ...step,
                          highlightHotspotId: step.highlightHotspotId === hotspot.id ? '' : step.highlightHotspotId,
                          advanceOnHotspotId: step.advanceOnHotspotId === hotspot.id ? '' : step.advanceOnHotspotId,
                          autoActivateHotspotId: step.autoActivateHotspotId === hotspot.id ? '' : step.autoActivateHotspotId,
                        }
                      : step
                  )),
                })))
                onSelectHotspot(null)
              }}
            >
              Delete hotspot
            </button>
          </div>
        )}
      </section>

      <section>
        <GuideEditor
          guides={guides}
          scenes={scenes}
          onGuidesChange={onGuidesChange}
          uploadAsset={uploadAsset}
        />
      </section>

      <AssetLibrary
        uploadAsset={uploadAsset}
        selectedHotspot={hotspot}
        onUseImage={useImageAsset}
        onUseModel={useModelAsset}
      />
    </aside>
  )
}
