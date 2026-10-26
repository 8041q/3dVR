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
import WorkflowOverview from './WorkflowOverview'
import PublishReviewDialog from './PublishReviewDialog'
import { projectChecks } from '../../editor/projectChecks'
import { removeProjectScene, removeProjectHotspot } from '../../editor/projectEdits'

const TOOLS = {
  overview: {
    id: 'overview', label: 'Start here', number: '⌂',
    description: 'Your tour workflow and the next things to finish.',
  },
  scene: {
    id: 'scene',
    label: 'Scenes',
    number: '01',
    description: 'Choose rooms and edit the panorama shown in each scene.',
  },
  hotspots: {
    id: 'hotspots',
    label: 'Hotspots',
    number: '02',
    description: 'Place hotspots, choose their appearance and define what they do.',
  },
  guides: {
    id: 'guides',
    label: 'Guides',
    number: '03',
    description: 'Build the step-by-step visitor journey.',
  },
  assets: {
    id: 'assets',
    label: 'Assets',
    number: '▧',
    description: 'Upload and reuse panoramas, models, audio and video.',
  },
  project: {
    id: 'project',
    label: 'Project',
    number: '⚙',
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
      aria-pressed={activeTab === tool.id && panelOpen}
    >
      <span className="rail-number" aria-hidden="true">{tool.number}</span>{tool.label}
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
  onEditProject,
  placingHotspot,
  onTogglePlacing,
  saveError,
  selectedHotspotId,
  onSelectHotspot,
  uploadAsset,
  guides = [],
  onGuidesChange,
  onUseProcessedPanorama,
  onRepositionHotspot,
  onCancelPlacing,
  onFocusHotspot,
  onResetView,
  onReadView,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) {
  const scene = scenes.find((item) => item.id === currentSceneId)
  const hotspot = scene?.hotspots?.find((item) => item.id === selectedHotspotId)
  const [activeTab, setActiveTab] = useState('overview')
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 760)
  const [shareResult, setShareResult] = useState(null)
  const [commandError, setCommandError] = useState('')
  const [hotspotSection, setHotspotSection] = useState('setup')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [hotspotType, setHotspotType] = useState(ACTION_TYPES.NAVIGATE_SCENE)
  const [hotspotDestination, setHotspotDestination] = useState('')
  const [creatorOpen, setCreatorOpen] = useState(false)
  const [guideSelection, setGuideSelection] = useState(null)
  const issues = useMemo(() => projectChecks({ scenes, guides, startSceneId }), [scenes, guides, startSceneId])
  const status = useMemo(
    () => projectStatus(projectDirty, projectMeta),
    [projectDirty, projectMeta],
  )

  useEffect(() => {
    if (placingHotspot && window.innerWidth <= 760) setPanelOpen(false)
  }, [placingHotspot])

  useEffect(() => {
    setCreatorOpen(false)
    if (!selectedHotspotId) return
    setActiveTab('hotspots')
    setPanelOpen(true)
    setHotspotSection('actions')
  }, [selectedHotspotId])

  function chooseTab(tabId) {
    onCancelPlacing?.()
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
        image: '',
        group: scene?.group || '',
        hotspots: [],
      },
    ])
    onNavigate(id)
  }

  function resolveIssue(issue) {
    setReviewOpen(false)
    chooseTab(issue.tool)
    if (issue.sceneId) onNavigate(issue.sceneId)
    if (issue.guideId) setGuideSelection({ guideId: issue.guideId, stepId: issue.stepId, id: crypto.randomUUID() })
    if (issue.hotspotId) {
      onSelectHotspot(issue.hotspotId)
      onFocusHotspot?.(issue.hotspotId, issue.sceneId)
      setHotspotSection('actions')
    }
  }

  function removeScene() {
    if (scenes.length <= 1) return
    onEditProject((project) => removeProjectScene(project, currentSceneId))
    onNavigate(scenes.find((item) => item.id !== currentSceneId).id)
  }

  function useImageAsset(asset) {
    patchScene({ image: asset.url, panorama: null })
    setActiveTab('scene')
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
    onEditProject((project) => removeProjectHotspot(project, currentSceneId, hotspot.id))
    onSelectHotspot(null)
  }

  async function publishAndShare() {
    setCommandError('')
    try {
      const result = await onPublishProject()
      if (result) {
        setReviewOpen(false)
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
      <header className="editor-topbar">
        <div className="editor-topbar__identity"><span className="editor-logo">3D<span>VR</span></span><div><strong>{projectTitle || projectId}</strong><span>Tour editor</span></div></div>
        <span className={`status-pill status-pill--${status.tone}`} role="status">{projectSaving ? 'Saving draft…' : status.label}</span>
        <div className="editor-topbar__actions">
          <div className="editor-history"><button onClick={onUndo} disabled={!canUndo || projectSaving || projectPublishing} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button><button onClick={onRedo} disabled={!canRedo || projectSaving || projectPublishing} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button></div>
          <button onClick={() => onSaveProject()} disabled={projectSaving || projectPublishing || !projectDirty} title="Save draft (Ctrl+S)">{projectSaving ? 'Saving…' : 'Save draft'}</button>
          <button onClick={onPreviewProject}>Preview ↗</button>
          <button className="primary" onClick={() => { setCommandError(''); setReviewOpen(true) }} disabled={projectSaving || projectPublishing}>Review & publish</button>
        </div>
      </header>
      {(saveError || commandError) && <div role="alert" className="editor-global-error">{saveError || commandError}</div>}
      <aside className={panelOpen ? 'editor-workspace' : 'editor-workspace editor-workspace--collapsed'}>
        <nav className="editor-tool-rail" aria-label="Editor tools">
          <RailButton tool={TOOLS.overview} activeTab={activeTab} panelOpen={panelOpen} onChoose={chooseTab} />

          <div className="editor-tool-rail__group">
            <span>Build</span>
            <RailButton tool={TOOLS.scene} activeTab={activeTab} panelOpen={panelOpen} onChoose={chooseTab} />
            <RailButton tool={TOOLS.hotspots} activeTab={activeTab} panelOpen={panelOpen} onChoose={chooseTab} />
          </div>

          <div className="editor-tool-rail__group">
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
              aria-expanded={panelOpen}
            >
              {panelOpen ? '← Hide panel' : 'Show panel →'}
            </button>
          </div>
        </nav>

        {panelOpen && (
          <div className="editor-panel editor-panel--workspace">
            <header className="editor-workspace__header">
              <div className="editor-workspace__heading">
                <div className="editor-eyebrow">{activeTab === 'overview' ? 'The big picture' : 'Edit your tour'}</div>
                <h1>{activeTool.label}</h1>
                <p>{activeTool.description}</p>
              </div>
            </header>

            <div key={activeTab} className="editor-workspace__content" inert={projectPublishing ? true : undefined}>
              {activeTab === 'overview' && <WorkflowOverview scenes={scenes} guides={guides} startSceneId={startSceneId} issues={issues} onChoose={chooseTab} onPreview={onPreviewProject} onReview={() => setReviewOpen(true)} onResolve={resolveIssue} />}
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
                  onOpenLibrary={() => chooseTab('assets')}
                  onEditHotspots={() => chooseTab('hotspots')}
                  onUseProcessedPanorama={onUseProcessedPanorama}
                />
              )}

              {activeTab === 'hotspots' && (
                <div className="editor-tool-view">
                  <div className="editor-tool-view__topline">
                    <div>
                      <div className="editor-subheading">Hotspots in this scene</div>
                      <div className="muted">{scene?.title || currentSceneId}</div>
                    </div>
                  </div>

                  {hotspot && <button className="editor-inline-next" onClick={() => setCreatorOpen((value) => !value)}>{creatorOpen ? 'Close new hotspot' : '+ Add another hotspot'}</button>}
                  {(!hotspot || creatorOpen) && <div className="hotspot-create-card">
                    <strong>Add a hotspot</strong><p>A hotspot is a clickable point in your scene.</p>
                    <label>What should it do?<select value={hotspotType} onChange={(event) => setHotspotType(event.target.value)}>
                      <option value={ACTION_TYPES.NAVIGATE_SCENE}>Go to another scene</option><option value={ACTION_TYPES.SHOW_INFO}>Show information</option><option value={ACTION_TYPES.INSPECT_MODEL}>Open a 3D product</option><option value={ACTION_TYPES.START_GUIDE}>Start a guided tour</option><option value={ACTION_TYPES.OPEN_URL}>Open a website</option><option value={ACTION_TYPES.PLAY_ROOM_ANIMATION}>Play a VR room animation</option>
                    </select></label>
                    {hotspotType === ACTION_TYPES.NAVIGATE_SCENE && <label>Destination<select value={hotspotDestination} onChange={(event) => setHotspotDestination(event.target.value)}><option value="">Choose a scene</option>{scenes.filter((item) => item.id !== currentSceneId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
                    <button className={placingHotspot ? 'active' : 'primary'} disabled={!placingHotspot && hotspotType === ACTION_TYPES.NAVIGATE_SCENE && !scenes.some((item) => item.id === hotspotDestination && item.id !== currentSceneId)} onClick={() => placingHotspot ? onCancelPlacing() : onTogglePlacing({ type: hotspotType, sceneId: hotspotDestination })}>{placingHotspot ? 'Cancel placement' : 'Place in scene →'}</button>
                  </div>}

                  {placingHotspot && (
                    <div className="editor-callout">Drag to look around. Click once to place. Press Esc to cancel.</div>
                  )}

                  <div className="hotspot-list">
                    {(scene?.hotspots || []).map((item) => (
                      <button
                        key={item.id}
                        className={item.id === selectedHotspotId ? 'active list-button' : 'list-button'}
                        onClick={() => { onSelectHotspot(item.id); onFocusHotspot?.(item.id) }}
                      >
                        <span>{item.label || item.id}</span>
                        <small>{normalizeHotspotActions(item).length ? `${normalizeHotspotActions(item).length} ${normalizeHotspotActions(item).length === 1 ? 'action' : 'actions'}` : 'Needs an action'}</small>
                      </button>
                    ))}
                  </div>

                  {!hotspot && (
                    <div className="editor-empty-state">
                      {scene?.hotspots?.length ? 'Select a hotspot above or in the scene to edit it. Selecting one here brings it into view.' : 'No hotspots in this scene yet. Choose what visitors should do, then place the first one.'}
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
                            role="tab"
                            aria-selected={hotspotSection === id}
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
                            <div className="button-row"><button onClick={() => onRepositionHotspot(hotspot.id)}>Move in scene</button><button onClick={() => onFocusHotspot?.(hotspot.id)}>Find in scene</button></div>
                            {Array.isArray(hotspot.spatialPosition) && <p className="muted">Moving here changes the panorama position. The tracked VR position comes from your Blender room.</p>}
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
                      {!normalizeHotspotActions(hotspot).length && <button className="editor-inline-next" onClick={() => setHotspotSection('actions')}>Next: choose what this hotspot does →</button>}
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
                  currentSceneId={currentSceneId}
                  onNavigate={onNavigate}
                  onReadView={onReadView}
                  selectionRequest={guideSelection}
                />
              )}

              {activeTab === 'assets' && (
                <div className="editor-tool-view editor-assets-tool">
                  <div className="editor-callout">
                    Images apply to <strong>{scene?.title}</strong>. Models attach to {hotspot ? <strong>{hotspot.label}</strong> : 'a hotspot you select in Hotspots'}. Audio and video URLs can be copied into your guide or product settings.
                  </div>
                  <PanoramaMasterUpload onUseProcessed={onUseProcessedPanorama} />
                  <AssetLibrary
                    uploadAsset={uploadAsset}
                    selectedHotspot={hotspot}
                    onUseImage={useImageAsset}
                    onUseModel={useModelAsset}
                    authToken={authToken}
                    projectContent={{ scenes, guides }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      <div className={`editor-canvas-toolbar${panelOpen ? '' : ' editor-canvas-toolbar--wide'}`}>
        <div><span className="editor-eyebrow">Editing scene</span><strong>{scene?.title}</strong></div>
        <select aria-label="Switch scene" value={currentSceneId} onChange={(event) => onNavigate(event.target.value)}>{scenes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        <button onClick={onResetView}>Reset view</button>
      </div>
      {!scene?.image && !scene?.panorama?.manifestUrl && <div className={`editor-canvas-empty${panelOpen ? '' : ' editor-canvas-empty--wide'}`}><span className="editor-eyebrow">A new perspective</span><h2>This room needs a view.</h2><p>Add a 360° panorama in Scenes to start building here.</p><button onClick={() => chooseTab('scene')}>Add a panorama →</button></div>}
      <div className={`editor-canvas-hint${panelOpen ? '' : ' editor-canvas-hint--wide'}${placingHotspot ? ' editor-canvas-hint--placing' : ''}`} role="status">
        <span>{placingHotspot ? 'Click to place · Drag to look around' : 'Drag to look around · Scroll to zoom · Click a hotspot to edit'}</span>
        {placingHotspot && <button onClick={onCancelPlacing}>Cancel <kbd>Esc</kbd></button>}
      </div>

      {reviewOpen && <PublishReviewDialog title={projectTitle} issues={issues} scenes={scenes} startSceneId={startSceneId} busy={projectPublishing} error={saveError || commandError} onResolve={resolveIssue} onPreview={onPreviewProject} onPublish={publishAndShare} onClose={() => setReviewOpen(false)} />}

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
