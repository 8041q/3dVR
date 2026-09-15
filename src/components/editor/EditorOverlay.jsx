import React, { useEffect, useMemo, useState } from 'react'
import { ACTION_TYPES, createAction, normalizeHotspotActions } from '../../actions/actionTypes'
import HotspotActionEditor from './HotspotActionEditor'
import HotspotStyleEditor from './HotspotStyleEditor'
import GuideEditor from './GuideEditor'
import ProjectManager from './ProjectManager'
import AssetLibrary from './AssetLibrary'
import PanoramaMasterUpload from './PanoramaMasterUpload'
import PublishShareDialog from '../PublishShareDialog'
import SceneOrganizer from './SceneOrganizer'

const TOOLS = {
  scene: {
    id: 'scene',
    label: 'Scenes',
    description: 'Choose rooms and edit the panorama shown in each scene.',
  },
  hotspots: {
    id: 'hotspots',
    label: 'Interactions',
    description: 'Place hotspots, choose their appearance and define what they do.',
  },
  guides: {
    id: 'guides',
    label: 'Guides',
    description: 'Build the step-by-step visitor journey.',
  },
  assets: {
    id: 'assets',
    label: 'Library',
    description: 'Upload and reuse panoramas, models, audio and video.',
  },
  project: {
    id: 'project',
    label: 'Project',
    description: 'Project name, duplication, sharing and publication settings.',
  },
}

function projectStatus(dirty, meta) {
  if (dirty) return { label: 'Unsaved changes', tone: 'warning' }
  if (meta?.hasUnpublishedChanges) return { label: 'Draft saved — not published', tone: 'warning' }
  if (meta?.isPublished) return { label: 'Published', tone: 'success' }
  return { label: 'Not published yet', tone: 'muted' }
}

function RailButton({ tool, activeTab, panelOpen, onChoose }) {
  return (
    <button
      type="button"
      className={activeTab === tool.id && panelOpen ? 'active' : ''}
      onClick={() => onChoose(tool.id)}
      title={tool.description}
    >
      {tool.label}
    </button>
  )
}

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
  onPreviewProject,
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
  onUseProcessedPanorama,
}) {
  const scene = scenes.find((item) => item.id === currentSceneId)
  const hotspot = scene?.hotspots?.find((item) => item.id === selectedHotspotId)
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('3dvr-editor-tool') || 'scene')
  const [panelOpen, setPanelOpen] = useState(true)
  const [shareResult, setShareResult] = useState(null)
  const [commandError, setCommandError] = useState('')
  const [hotspotSection, setHotspotSection] = useState('setup')
  const status = useMemo(
    () => projectStatus(projectDirty, projectMeta),
    [projectDirty, projectMeta],
  )

  useEffect(() => {
    localStorage.setItem('3dvr-editor-tool', activeTab)
  }, [activeTab])

  useEffect(() => {
    if (!selectedHotspotId) return
    setActiveTab('hotspots')
    setPanelOpen(true)
    setHotspotSection('setup')
  }, [selectedHotspotId])

  function chooseTab(tabId) {
    setActiveTab(tabId)
    setPanelOpen(true)
  }

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

  function addScene(title = 'New scene') {
    const id = `scene-${Date.now()}`
    onScenesChange([
      ...scenes,
      {
        id,
        title: String(title || 'New scene').trim() || 'New scene',
        image: '/demo/lobby.jpg',
        group: scene?.group || '',
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
    setActiveTab('hotspots')
    setHotspotSection('actions')
  }

  function deleteHotspot() {
    if (!hotspot) return
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
  }

  async function publishAndShare() {
    setCommandError('')
    try {
      const result = await onPublishProject()
      if (result) {
        setShareResult({
          revision: result.manifest?.revision || result.meta?.publishedRevision,
          publishedAt: result.manifest?.publishedAt || result.meta?.publishedAt,
        })
      }
    } catch (error) {
      setCommandError(error.message || 'Publish failed')
    }
  }

  const activeTool = TOOLS[activeTab] || TOOLS.scene
  const startScene = scenes.find((item) => item.id === startSceneId)

  return (
    <>
      <aside className={panelOpen ? 'editor-workspace' : 'editor-workspace editor-workspace--collapsed'}>
        <nav className="editor-tool-rail" aria-label="Editor tools">
          <div className="editor-tool-rail__brand">3DVR</div>

          <div className="editor-tool-rail__group">
            <span>Build</span>
            <RailButton tool={TOOLS.scene} activeTab={activeTab} panelOpen={panelOpen} onChoose={chooseTab} />
            <RailButton tool={TOOLS.hotspots} activeTab={activeTab} panelOpen={panelOpen} onChoose={chooseTab} />
          </div>

          <div className="editor-tool-rail__group">
            <span>Experience</span>
            <RailButton tool={TOOLS.guides} activeTab={activeTab} panelOpen={panelOpen} onChoose={chooseTab} />
          </div>

          <div className="editor-tool-rail__group">
            <span>Content</span>
            <RailButton tool={TOOLS.assets} activeTab={activeTab} panelOpen={panelOpen} onChoose={chooseTab} />
          </div>

          <div className="editor-tool-rail__bottom">
            <RailButton tool={TOOLS.project} activeTab={activeTab} panelOpen={panelOpen} onChoose={chooseTab} />
            <button
              type="button"
              className="editor-tool-rail__collapse"
              onClick={() => setPanelOpen((value) => !value)}
            >
              {panelOpen ? 'Hide' : 'Show'}
            </button>
          </div>
        </nav>

        {panelOpen && (
          <div className="editor-panel editor-panel--workspace">
            <header className="editor-workspace__header">
              <div className="editor-workspace__heading">
                <div className="editor-eyebrow">{activeTool.label}</div>
                <strong title={projectTitle}>{projectTitle || projectId}</strong>
                <p>{activeTool.description}</p>
              </div>
              <span className={`status-pill status-pill--${status.tone}`}>{status.label}</span>
            </header>

            <div className="editor-commandbar">
              <button
                type="button"
                onClick={onSaveProject}
                disabled={projectSaving || projectPublishing || !projectDirty}
              >
                {projectSaving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={onPreviewProject}>Preview</button>
              <button
                type="button"
                className="primary"
                onClick={publishAndShare}
                disabled={projectSaving || projectPublishing}
              >
                {projectPublishing ? 'Publishing...' : 'Publish'}
              </button>
            </div>

            {(saveError || commandError) && (
              <div className="error-text editor-command-error">{saveError || commandError}</div>
            )}

            <div className="editor-workspace__content">
              {activeTab === 'project' && (
                <ProjectManager
                  projectId={projectId}
                  title={projectTitle}
                  meta={projectMeta}
                  token={authToken}
                  onTitleChange={onProjectTitleChange}
                />
              )}

              {activeTab === 'scene' && (
                <SceneOrganizer
                  scenes={scenes}
                  currentSceneId={currentSceneId}
                  startSceneId={startSceneId}
                  onNavigate={onNavigate}
                  onScenesChange={onScenesChange}
                  onAddScene={addScene}
                  onRemoveScene={removeScene}
                  onStartSceneChange={onStartSceneChange}
                  patchScene={patchScene}
                  uploadAsset={uploadAsset}
                />
              )}

              {activeTab === 'hotspots' && (
                <div className="editor-tool-view">
                  <div className="editor-tool-view__topline">
                    <div>
                      <div className="editor-subheading">Hotspots in this scene</div>
                      <div className="muted">{scene?.title || currentSceneId}</div>
                    </div>
                    <button className={placingHotspot ? 'active' : ''} onClick={onTogglePlacing}>
                      {placingHotspot ? 'Click panorama' : 'Add hotspot'}
                    </button>
                  </div>

                  {placingHotspot && (
                    <div className="editor-callout">Click anywhere in the panorama to place the new hotspot.</div>
                  )}

                  <div className="hotspot-list">
                    {(scene?.hotspots || []).map((item) => (
                      <button
                        key={item.id}
                        className={item.id === selectedHotspotId ? 'active list-button' : 'list-button'}
                        onClick={() => onSelectHotspot(item.id)}
                      >
                        <span>{item.label || item.id}</span>
                        <small>{item.style?.preset || 'navigation'}</small>
                      </button>
                    ))}
                  </div>

                  {!hotspot && (
                    <div className="editor-empty-state">
                      Select a hotspot in this list or directly in the panorama. Then edit its setup, appearance or actions.
                    </div>
                  )}

                  {hotspot && (
                    <div className="hotspot-focused-editor">
                      <div className="editor-context-strip">
                        <span>Selected hotspot</span>
                        <strong>{hotspot.label || hotspot.id}</strong>
                      </div>

                      <div className="segmented-control" role="tablist" aria-label="Hotspot editor sections">
                        {[
                          ['setup', 'Setup'],
                          ['appearance', 'Appearance'],
                          ['actions', 'Actions'],
                        ].map(([id, label]) => (
                          <button
                            type="button"
                            key={id}
                            className={hotspotSection === id ? 'active' : ''}
                            onClick={() => setHotspotSection(id)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <div className="editor-inspector-card hotspot-focused-editor__body">
                        {hotspotSection === 'setup' && (
                          <>
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
                                type="range"
                                min="0.4"
                                max="4"
                                step="0.1"
                                value={hotspot.size || 1}
                                onChange={(event) => patchHotspot({
                                  ...hotspot,
                                  size: Number(event.target.value),
                                })}
                              />
                              <span className="muted">{Number(hotspot.size || 1).toFixed(1)}×</span>
                            </label>
                            <div className="hotspot-position-summary">
                              <span>Yaw {Number(hotspot.position?.yaw || 0).toFixed(1)}°</span>
                              <span>Pitch {Number(hotspot.position?.pitch || 0).toFixed(1)}°</span>
                            </div>
                            <button className="danger" onClick={deleteHotspot}>Delete hotspot</button>
                          </>
                        )}

                        {hotspotSection === 'appearance' && (
                          <HotspotStyleEditor hotspot={hotspot} onUpdate={patchHotspot} />
                        )}

                        {hotspotSection === 'actions' && (
                          <HotspotActionEditor
                            hotspot={hotspot}
                            scenes={scenes}
                            guides={guides}
                            currentSceneId={currentSceneId}
                            uploadAsset={uploadAsset}
                            onUpdate={patchHotspot}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'guides' && (
                <GuideEditor
                  guides={guides}
                  scenes={scenes}
                  onGuidesChange={onGuidesChange}
                  uploadAsset={uploadAsset}
                />
              )}

              {activeTab === 'assets' && (
                <div className="editor-tool-view editor-assets-tool">
                  <div className="editor-callout">
                    Use the library to reuse content. Use High-resolution panorama when the source is a large 2:1 render.
                  </div>
                  <PanoramaMasterUpload onUseProcessed={onUseProcessedPanorama} />
                  <AssetLibrary
                    uploadAsset={uploadAsset}
                    selectedHotspot={hotspot}
                    onUseImage={useImageAsset}
                    onUseModel={useModelAsset}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {shareResult && (
        <PublishShareDialog
          projectId={projectId}
          projectTitle={projectTitle}
          sceneCount={scenes.length}
          guideCount={guides.length}
          startSceneTitle={startScene?.title || startSceneId}
          revision={shareResult.revision}
          publishedAt={shareResult.publishedAt}
          onClose={() => setShareResult(null)}
        />
      )}
    </>
  )
}
