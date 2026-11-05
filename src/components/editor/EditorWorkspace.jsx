import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Viewer from '../Viewer'
import PublishShareDialog from '../PublishShareDialog'
import AssetLibrary from './AssetLibrary'
import GuideEditor from './GuideEditor'
import HotspotInspector, { NewHotspot } from './HotspotInspector'
import ModelAuthoringEditor from './ModelAuthoringEditor'
import ProjectManager from './ProjectManager'
import ProjectDetails from './ProjectDetails'
import PublishReviewDialog from './PublishReviewDialog'
import SceneInspector from './SceneInspector'
import SceneOrganizer from './SceneOrganizer'
import { ACTION_CHOICES, ACTION_TYPES, createAction, normalizeHotspotActions, withHotspotActions } from '../../actions/actionTypes'
import { projectChecks } from '../../editor/projectChecks'
import { checkProjectMedia } from '../../editor/checkProjectMedia'
import { removeProjectHotspot, removeProjectScene, replaceSpatialRoom } from '../../editor/projectEdits'
import { hasPanorama, panoramaKey } from '../../panorama/panoramaSource'
import { replaceProductModel } from '../../product/modelMetadata'
import { resolveSceneId } from '../../viewer/sceneSelection'
import { projectViewerSettings } from '../../projectSettings.js'

const SCENE_INSPECTOR = { kind: 'scene' }
const WORKSPACES = [
  { kind: 'scenes', label: 'Scenes' },
  { kind: 'guides', label: 'Guides' },
  { kind: 'assets', label: 'Assets' },
  { kind: 'project', label: 'Project' },
]

function statusForDraft(draft) {
  if (draft.publishing) return 'Publishing…'
  if (draft.saving) return 'Saving…'
  if (draft.dirty) return 'Unsaved changes'
  if (draft.meta?.isPublished && !draft.meta.hasUnpublishedChanges) return 'Published'
  return 'Draft saved'
}

function AssetPicker({ title, onClose, children }) {
  const dialog = useRef(null)

  useEffect(() => {
    const opener = document.activeElement
    dialog.current.showModal()
    return () => {
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  function close() {
    dialog.current.close()
    onClose()
  }

  return (
    <dialog ref={dialog} className="studio-asset-picker" aria-labelledby="studio-picker-title"
      onCancel={(event) => { event.preventDefault(); close() }}>
      <header className="studio-workspace-header">
        <h2 id="studio-picker-title">{title}</h2>
        <button type="button" onClick={close}>Cancel</button>
      </header>
      <div className="studio-workspace-body">{children}</div>
    </dialog>
  )
}

export default function EditorWorkspace({ projectId, draft, authToken }) {
  const { project, scenes, guides } = draft
  const [workspace, setWorkspace] = useState({ kind: 'scenes' })
  const [assetPicker, setAssetPicker] = useState(null)
  const [sceneOptionsRequest, setSceneOptionsRequest] = useState(null)
  const [guideRequest, setGuideRequest] = useState(null)
  const [selectedSceneId, setSelectedSceneId] = useState(null)
  const [panel, setPanel] = useState(SCENE_INSPECTOR)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [placement, setPlacement] = useState(null)
  const [focusRequest, setFocusRequest] = useState(null)
  const [preview, setPreview] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [mediaReview, setMediaReview] = useState(null)
  const [panoramaStatus, setPanoramaStatus] = useState(null)
  const [modelStatus, setModelStatus] = useState({})
  const [share, setShare] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const viewRef = useRef({ yaw: 0, pitch: 0 })
  const previewButton = useRef(null)
  const previewSceneButton = useRef(null)
  const previewOpener = useRef(null)
  const editProductButton = useRef(null)
  const workspaceHeading = useRef(null)
  const projectMenu = useRef(null)
  const inspectorRef = useRef(null)
  const stageRef = useRef(null)
  const sceneId = resolveSceneId(scenes, selectedSceneId, project.startSceneId)
  const startSceneId = resolveSceneId(scenes, null, project.startSceneId)
  const scene = scenes.find((item) => item.id === sceneId)
  const hotspot = panel.sceneId === sceneId && scene?.hotspots?.find((item) => item.id === panel.hotspotId)
  const panoramaConfigured = hasPanorama(scene)
  const currentPanoramaStatus = panoramaStatus?.key === panoramaKey(scene) ? panoramaStatus : null
  const panoramaReady = panoramaConfigured && currentPanoramaStatus?.state === 'ready'
  const startReady = hasPanorama(scenes.find((item) => item.id === startSceneId))
  const sceneWorkspace = workspace.kind === 'scenes'
  const activePlacement = placement?.sceneId === sceneId && (
    !placement.hotspotId || scene?.hotspots?.some((item) => item.id === placement.hotspotId)
  ) ? placement : null
  const projectIssues = useMemo(() => projectChecks(project, { includeWarnings: true }), [project])
  const mediaCurrent = mediaReview?.project === project && mediaReview?.modelStatus === modelStatus
  const mediaIssues = mediaCurrent ? mediaReview.issues : []
  const reviewItems = [...projectIssues, ...mediaIssues]
  const issues = reviewItems.filter((issue) => issue.severity !== 'warning')
  const warnings = reviewItems.filter((issue) => issue.severity === 'warning')
  const checkingMedia = reviewOpen && !mediaCurrent
  const busy = draft.saving || draft.publishing
  const handleModelStatus = useCallback((status) => {
    setModelStatus((current) => ({ ...current, [status.url]: status }))
  }, [])

  useEffect(() => {
    if (!reviewOpen) return undefined
    const controller = new AbortController()
    checkProjectMedia(project, controller.signal, modelStatus).then((items) => {
      if (!controller.signal.aborted) setMediaReview({ project, modelStatus, issues: items })
    }).catch(() => {
      if (!controller.signal.aborted) setMediaReview({
        project, modelStatus, issues: [{ message: 'Media checks couldn’t finish. Close this review and try again.' }],
      })
    })
    return () => controller.abort()
  }, [modelStatus, project, reviewOpen])

  function revealOnNarrowScreen(ref) {
    if (window.matchMedia('(max-width: 800px)').matches) {
      requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'start' }))
    }
  }

  function openPanel(next) {
    setPlacement(null)
    setPanel(next)
    setInspectorOpen(true)
    revealOnNarrowScreen(inspectorRef)
  }

  function openWorkspace(next) {
    if (sceneWorkspace && next.kind !== 'scenes') focusAt(viewRef.current, viewRef.current.fov)
    setPlacement(null)
    setWorkspace(next)
  }

  function showScene(id) {
    setSelectedSceneId(id)
    setPlacement(null)
  }

  function selectScene(id) {
    if (id !== sceneId) focusAt({ yaw: 0, pitch: 0 }, 75)
    showScene(id)
    setPanel(SCENE_INSPECTOR)
    setInspectorOpen(true)
  }

  function focusAt(position, fov) {
    setFocusRequest({ id: crypto.randomUUID(), ...position, fov })
  }

  function selectHotspot(id, target = scene, center = false) {
    const selected = target?.hotspots?.find((item) => item.id === id)
    if (!selected) return
    showScene(target.id)
    setPanel({ kind: 'hotspot', sceneId: target.id, hotspotId: id })
    setInspectorOpen(true)
    if (center) focusAt(selected.position)
    revealOnNarrowScreen(inspectorRef)
  }

  function patchScene(id, change) {
    draft.updateScenes((latest) => latest.map((item) => {
      if (item.id !== id) return item
      const patch = typeof change === 'function' ? change(item) : change
      return patch ? { ...item, ...patch } : item
    }))
  }

  function patchHotspot(ownerId, id, change) {
    patchScene(ownerId, (current) => ({
      hotspots: (current.hotspots || []).map((item) => item.id === id
        ? { ...item, ...(typeof change === 'function' ? change(item) : change) }
        : item),
    }))
  }

  function patchModel(target, change) {
    patchScene(target.sceneId, (current) => {
      const owner = current.hotspots?.find((item) => item.id === target.hotspotId)
      if (!owner) return null
      const actions = normalizeHotspotActions(owner)
      const action = actions.find((item) => item.id === target.actionId && item.type === ACTION_TYPES.INSPECT_MODEL)
      if (!action) return null
      const patch = typeof change === 'function' ? change(action) : change
      if (!patch) return null
      return {
        hotspots: current.hotspots.map((item) => item.id === owner.id
          ? withHotspotActions(item, actions.map((entry) => entry === action ? { ...entry, ...patch } : entry))
          : item),
      }
    })
  }

  function changeSpatialRoom(id, result, expectedRoomUrl) {
    let applied = false
    draft.updateProject((current) => {
      const target = current.scenes.find((item) => item.id === id)
      if (!target || target.spatial?.roomUrl !== expectedRoomUrl) return current
      applied = true
      return replaceSpatialRoom(current, id, result)
    })
    if (!applied) setNotice('The upload finished after the room or scene changed. The current scene was kept.')
    return applied
  }

  function addScene() {
    const id = crypto.randomUUID()
    draft.updateProject((latest) => ({
      ...latest,
      startSceneId: latest.scenes.length ? latest.startSceneId : id,
      scenes: [...latest.scenes, { id, title: `Scene ${latest.scenes.length + 1}`, image: '', hotspots: [] }],
    }))
    selectScene(id)
    revealOnNarrowScreen(inspectorRef)
  }

  function placeHotspot(position) {
    if (!activePlacement || !panoramaReady) return
    const ownerId = activePlacement.sceneId
    const id = activePlacement.hotspotId || crypto.randomUUID()

    if (activePlacement.hotspotId) {
      patchHotspot(ownerId, id, { position })
    } else {
      const action = createAction(activePlacement.type)
      const destination = scenes.find((item) => item.id === activePlacement.destination)
      if (action.type === ACTION_TYPES.NAVIGATE_SCENE) {
        if (!destination) {
          setPlacement(null)
          return
        }
        action.sceneId = destination.id
      }
      const label = action.type === ACTION_TYPES.NAVIGATE_SCENE
        ? `Go to ${destination.title || 'scene'}`
        : ACTION_CHOICES.find((choice) => choice.type === action.type)?.label || 'Hotspot'
      const preset = action.type === ACTION_TYPES.SHOW_INFO ? 'info'
        : action.type === ACTION_TYPES.INSPECT_MODEL ? 'product' : 'navigation'
      const item = withHotspotActions({ id, label, position, size: 1, style: { preset } }, [action])
      patchScene(ownerId, (current) => ({ hotspots: [...(current.hotspots || []), item] }))
    }
    openPanel({ kind: 'hotspot', sceneId: ownerId, hotspotId: id })
  }

  function openPreview(firstSceneId, opener = previewButton.current, guideId = '', guideStepId = '') {
    if (!hasPanorama(scenes.find((item) => item.id === firstSceneId))) return
    previewOpener.current = opener
    setPlacement(null)
    setReviewOpen(false)
    setPreview({ sceneId: firstSceneId, initialSceneId: firstSceneId, startSceneId, scenes, guides, settings: projectViewerSettings(project), guideId, guideStepId, run: 0 })
  }

  function previewGuide(id, opener, stepId = '') {
    const steps = guides.find((guide) => guide.id === id)?.steps || []
    const firstStep = steps.find((step) => step.id === stepId) || steps[0]
    if (!firstStep) return
    const firstSceneId = firstStep.sceneId || (panoramaConfigured ? sceneId : startSceneId)
    if (!hasPanorama(scenes.find((item) => item.id === firstSceneId))) {
      setError('Add a panorama to this step’s scene before previewing it.')
      return
    }
    setError('')
    openPreview(firstSceneId, opener, id, firstStep.id)
  }

  function exitPreview() {
    focusAt(viewRef.current, viewRef.current.fov)
    setPreview(null)
    requestAnimationFrame(() => previewOpener.current?.focus())
  }

  async function save() {
    setError('')
    try {
      return await draft.saveDraft()
    } catch (failure) {
      setError(failure.message || 'Could not save the draft.')
      return null
    }
  }

  async function publish() {
    if (busy || checkingMedia || issues.length) return
    setError('')
    try {
      const result = await draft.publish(project)
      if (!result) return
      setReviewOpen(false)
      setShare(result)
    } catch (failure) {
      setError(failure.message || 'Could not publish the draft.')
    }
  }

  function resolveIssue(issue) {
    setReviewOpen(false)
    if (!issue.tool) return
    setInspectorOpen(true)
    setPlacement(null)
    if (issue.tool === 'guides') {
      setGuideRequest({ guideId: issue.guideId, stepId: issue.stepId, field: issue.field, id: crypto.randomUUID() })
      openWorkspace({ kind: 'guides' })
      requestAnimationFrame(() => workspaceHeading.current?.focus())
      return
    }

    if (issue.hotspotId) {
      const target = { sceneId: issue.sceneId, hotspotId: issue.hotspotId, actionId: issue.actionId }
      const productIssue = Boolean(issue.actionId && getProduct(target).action)
      openWorkspace(productIssue ? { kind: 'product', ...target } : { kind: 'scenes' })
      selectHotspot(issue.hotspotId, scenes.find((item) => item.id === issue.sceneId), true)
      if (issue.actionId) {
        setPanel((current) => ({ ...current, request: { actionId: issue.actionId, id: crypto.randomUUID() } }))
      }
      if (productIssue) {
        editProductButton.current = null
        requestAnimationFrame(() => workspaceHeading.current?.focus())
      }
    } else {
      openWorkspace({ kind: 'scenes' })
      selectScene(issue.sceneId || sceneId)
      if (!issue.sceneId && sceneId) setSceneOptionsRequest({ sceneId, id: crypto.randomUUID() })
      else revealOnNarrowScreen(inspectorRef)
    }
  }

  useEffect(() => {
    if (!draft.dirty) return undefined
    function warn(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draft.dirty])

  useEffect(() => {
    function keydown(event) {
      if (event.defaultPrevented || preview || reviewOpen || share || document.querySelector('dialog[open]')) return
      if (event.key === 'Escape' && activePlacement) setPlacement(null)
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        if (!busy && draft.dirty) void save()
      }
      const editingText = event.target.closest?.('input, textarea, select, [contenteditable="true"]')
      if (key === 'z' && !editingText && !busy) {
        event.preventDefault()
        if (event.shiftKey) draft.redo()
        else draft.undo()
        setPlacement(null)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  function getProduct(target) {
    const owner = scenes.find((item) => item.id === target.sceneId)?.hotspots?.find((item) => item.id === target.hotspotId)
    const action = normalizeHotspotActions(owner).find((item) =>
      item.id === target.actionId && item.type === ACTION_TYPES.INSPECT_MODEL,
    )
    return { owner, action }
  }

  const product = workspace.kind === 'product' ? getProduct(workspace) : null
  const assetTarget = assetPicker && scenes.find((item) => item.id === assetPicker.sceneId)
  const pickingModel = assetPicker?.type === 'model'
  const pickerProduct = pickingModel ? getProduct(assetPicker) : null
  const heading = panel.kind === 'hotspot' && hotspot ? 'Hotspot'
    : panel.kind === 'new-hotspot' ? 'Add hotspot' : 'Scene'
  const previewScene = preview?.scenes.find((item) => item.id === preview.sceneId)
  const inspectorKey = `${heading}-${sceneId}-${hotspot?.id || ''}`

  function openProduct(actionId) {
    editProductButton.current = document.activeElement
    openWorkspace({ kind: 'product', sceneId, hotspotId: hotspot.id, actionId })
    requestAnimationFrame(() => workspaceHeading.current?.focus())
  }

  function returnToHotspot() {
    const owner = scenes.find((item) => item.id === workspace.sceneId)
    if (product?.owner) selectHotspot(workspace.hotspotId, owner)
    else selectScene(owner?.id || sceneId)
    if (product?.action) {
      setPanel((current) => ({ ...current, request: { actionId: workspace.actionId, id: crypto.randomUUID() } }))
    }
    openWorkspace({ kind: 'scenes' })
    requestAnimationFrame(() => {
      if (editProductButton.current?.isConnected) editProductButton.current.focus()
      else inspectorRef.current?.focus()
    })
  }

  function openPanoramaPicker() {
    setAssetPicker({ type: 'image', sceneId })
  }

  return (
    <div className="app studio-app">
      <div className="editor-studio" hidden={Boolean(preview)}>
        <header className="editor-topbar studio-header">
          <div className="studio-identity">
            <span className="editor-logo" aria-label="Atria 3DVR">
              <img src="/brand/3dvr-portal-v2.svg" alt="" width="40" height="40" />
              <span>Atria 3DVR</span>
            </span>
            <details className="studio-project-menu" ref={projectMenu}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || !event.currentTarget.open) return
                event.preventDefault()
                event.currentTarget.open = false
                event.currentTarget.querySelector('summary')?.focus()
              }}>
              <summary aria-label={`${project.title || 'Untitled tour'} project menu`}><h1>{project.title || 'Untitled tour'}</h1><span aria-hidden="true">▾</span></summary>
              <div>
                <button onClick={() => {
                  projectMenu.current.open = false
                  openWorkspace({ kind: 'project' })
                  requestAnimationFrame(() => workspaceHeading.current?.focus())
                }}>Project details</button>
                <button onClick={() => {
                  projectMenu.current.open = false
                  openWorkspace({ kind: 'projects' })
                  requestAnimationFrame(() => workspaceHeading.current?.focus())
                }}>Manage projects</button>
              </div>
            </details>
          </div>
          <span className={`studio-status${draft.dirty ? ' studio-warning' : ''}`} role="status">{statusForDraft(draft)}</span>
          <div className="studio-commands">
            <div className="studio-history">
              <button aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!draft.canUndo || busy} onClick={() => { setPlacement(null); draft.undo() }}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" /></svg>
              </button>
              <button aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!draft.canRedo || busy} onClick={() => { setPlacement(null); draft.redo() }}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" /></svg>
              </button>
            </div>
            <button disabled={!draft.dirty || busy} onClick={save}>Save draft</button>
            <button ref={previewButton} disabled={(!startReady && !panoramaConfigured) || draft.publishing}
              onClick={() => openPreview(startReady ? startSceneId : sceneId, previewButton.current, projectViewerSettings(project).defaultGuideId)}>Preview</button>
            <button
              className="primary studio-publish"
              disabled={busy}
              aria-label={issues.length ? `Review and publish, ${issues.length} ${issues.length === 1 ? 'item' : 'items'} to resolve` : undefined}
              onClick={() => { setError(''); setMediaReview(null); setReviewOpen(true) }}
            >
              Review &amp; publish
              {issues.length > 0 && <span className="studio-issue-count" aria-hidden="true">{issues.length}</span>}
            </button>
          </div>
        </header>
        <nav className="studio-workspace-nav" aria-label="Project workspaces" inert={draft.publishing ? true : undefined}>
          {WORKSPACES.map(({ kind, label }) => (
            <button key={kind} type="button" className={kind === 'project' ? 'studio-project-tab' : undefined}
              aria-current={workspace.kind === kind || (kind === 'project' && workspace.kind === 'projects') ? 'page' : undefined}
              onClick={() => openWorkspace({ kind })}>{label}</button>
          ))}
        </nav>
        {error && !reviewOpen && (
          <div className="studio-error" role="alert">
            {error}<button aria-label="Dismiss message" onClick={() => setError('')}>×</button>
          </div>
        )}
        {notice && (
          <div className="studio-notice" role="status">
            {notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}>×</button>
          </div>
        )}

        <div className={`studio-grid${inspectorOpen ? '' : ' studio-grid--wide'}`} hidden={!sceneWorkspace} inert={draft.publishing ? true : undefined}>
          <aside className="editor-panel studio-scenes">
            <SceneOrganizer
              scenes={scenes}
              currentSceneId={sceneId}
              startSceneId={project.startSceneId}
              onNavigate={selectScene}
              onScenesChange={draft.updateScenes}
              onAddScene={addScene}
              onStartSceneChange={(id) => {
                setSelectedSceneId(sceneId)
                draft.updateStartScene(id)
              }}
              optionsRequest={sceneOptionsRequest}
            />
          </aside>

          <main ref={stageRef} className="studio-stage" aria-label="Scene canvas">
            <header className="studio-stage-header">
              <h2 title={scene?.title}>{scene?.title || 'No scene selected'}</h2>
              <div className="studio-stage-tools">
                <button ref={previewSceneButton} disabled={!panoramaConfigured} onClick={() => openPreview(sceneId, previewSceneButton.current)}>Preview scene</button>
                <button disabled={!panoramaReady} onClick={() => focusAt({ yaw: 0, pitch: 0 }, 75)}>Reset view</button>
                <button aria-controls="studio-inspector" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen((open) => !open)}>
                  {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
                </button>
              </div>
            </header>
            <div className="studio-viewport">
              {sceneWorkspace && !preview && scene && panoramaConfigured && (
                <Viewer
                  sceneId={sceneId}
                  scenes={scenes}
                  guides={guides}
                  onNavigate={selectScene}
                  editMode
                  placingHotspot={Boolean(activePlacement)}
                  selectedHotspotId={panel.kind === 'hotspot' ? hotspot?.id : null}
                  onSelectHotspot={(id) => selectHotspot(id)}
                  onHotspotCreate={placeHotspot}
                  editorFocusRequest={focusRequest}
                  editorViewRef={viewRef}
                  onPanoramaStatus={setPanoramaStatus}
                  showModeBar={false}
                />
              )}
              {!panoramaConfigured && (
                <div className="studio-canvas-empty">
                  <span aria-hidden="true">360°</span>
                  <h2>{scene ? 'Add a panorama' : 'Create your first scene'}</h2>
                  <p>{scene ? 'Choose or upload a panorama to edit and test this scene.' : 'Each scene is one place visitors can look around.'}</p>
                  <button onClick={scene ? openPanoramaPicker : addScene}>{scene ? 'Choose panorama' : 'Add scene'}</button>
                </div>
              )}
            </div>
            <footer className={`studio-canvas-status${activePlacement ? ' is-placing' : ''}`} role="status">
              <span>{activePlacement && panoramaReady
                ? activePlacement.hotspotId ? 'Click a new position for this hotspot' : 'Click where the new hotspot should appear'
                : panoramaReady ? 'Drag to look around · Scroll to zoom'
                  : panoramaConfigured ? 'Hotspot placement is available once the panorama loads' : 'Add a panorama to edit this scene'}</span>
              {activePlacement && <button onClick={() => setPlacement(null)}>Cancel <kbd>Esc</kbd></button>}
            </footer>
          </main>

          <aside id="studio-inspector" ref={inspectorRef} className="editor-panel studio-inspector" aria-label={heading} hidden={!inspectorOpen} tabIndex={-1}>
            <header className="studio-inspector-header">
              <h2>{heading}</h2>
              {panel.kind !== 'scene' && (
                <button onClick={() => openPanel(SCENE_INSPECTOR)}>Back to scene</button>
              )}
            </header>
            <div className="studio-inspector-body" key={inspectorKey}>
              {panel.kind === 'hotspot' && hotspot ? (
                <HotspotInspector
                  hotspot={hotspot} scene={scene} scenes={scenes} guides={guides}
                  patchHotspot={(change) => patchHotspot(sceneId, hotspot.id, change)}
                  selectionRequest={panel.request}
                  onEditActions={(update) => patchHotspot(sceneId, hotspot.id, (current) => withHotspotActions(current, update(normalizeHotspotActions(current))))}
                  onMove={panoramaReady ? () => { setPlacement({ sceneId, hotspotId: hotspot.id }); revealOnNarrowScreen(stageRef) } : undefined}
                  onFind={() => focusAt(hotspot.position)}
                  onEditProduct={openProduct}
                  onDelete={() => {
                    draft.updateProject((latest) => removeProjectHotspot(latest, sceneId, hotspot.id))
                    openPanel(SCENE_INSPECTOR)
                  }}
                />
              ) : panel.kind === 'new-hotspot' && panoramaReady ? (
                <NewHotspot
                  scene={scene} scenes={scenes} guides={guides} placement={activePlacement}
                  onPlace={(config) => { setPlacement({ sceneId, ...config }); revealOnNarrowScreen(stageRef) }}
                  onCancelPlacement={() => setPlacement(null)}
                />
              ) : scene ? (
                <SceneInspector
                  scene={scene} scenes={scenes} projectId={projectId} uploadAsset={draft.uploadAsset}
                  panoramaStatus={currentPanoramaStatus}
                  patchScene={(change) => patchScene(sceneId, change)}
                  onRemoveScene={() => {
                    draft.updateProject((latest) => removeProjectScene(latest, sceneId))
                    setSelectedSceneId(null)
                    openPanel(SCENE_INSPECTOR)
                  }}
                  onSelectHotspot={(id) => selectHotspot(id, scene, true)}
                  onAddHotspot={() => openPanel({ kind: 'new-hotspot' })}
                  onChoosePanorama={openPanoramaPicker}
                  onPanoramaNotice={setNotice}
                  onSpatialChange={(result, expectedRoomUrl) => changeSpatialRoom(sceneId, result, expectedRoomUrl)}
                />
              ) : <p className="muted">Add a scene to see its settings and hotspots here.</p>}
            </div>
          </aside>
        </div>

        <main className="editor-panel studio-workspace-view studio-workspace-view--guides" aria-label="Guides"
          hidden={workspace.kind !== 'guides'} inert={draft.publishing ? true : undefined}>
          <header className="studio-workspace-header">
            <h2 ref={workspace.kind === 'guides' ? workspaceHeading : null} tabIndex={-1}>Guides</h2>
          </header>
          <div className="studio-workspace-body">
            <GuideEditor guides={guides} scenes={scenes} onGuidesChange={draft.updateGuides}
              currentSceneId={sceneId} selectionRequest={guideRequest} active={workspace.kind === 'guides' && !preview}
              onPreviewGuide={previewGuide} />
          </div>
        </main>

        {workspace.kind === 'assets' && (
          <main className="editor-panel studio-workspace-view studio-workspace-view--assets" aria-label="Assets"
            inert={draft.publishing ? true : undefined}>
            <header className="studio-workspace-header"><h2>Assets</h2></header>
            <div className="studio-workspace-body">
              <AssetLibrary authToken={authToken} uploadAsset={draft.uploadAsset} projectContent={project} />
            </div>
          </main>
        )}

        {['project', 'projects'].includes(workspace.kind) && (
          <main className="editor-panel studio-workspace-view studio-workspace-view--project" aria-label={workspace.kind === 'project' ? 'Project details' : 'Manage projects'}
            inert={draft.publishing ? true : undefined}>
            <header className="studio-workspace-header">
              <div>
                <h2 ref={workspaceHeading} tabIndex={-1}>{workspace.kind === 'project' ? 'Project details' : 'Manage projects'}</h2>
                <p>{workspace.kind === 'project'
                  ? 'Metadata, credits, and viewer settings. Use Save draft to keep your changes.'
                  : 'Browse your projects, create a new experience, or duplicate your current draft.'}</p>
              </div>
            </header>
            <nav className="studio-project-navigation" aria-label="Project tools">
              <button type="button" aria-current={workspace.kind === 'project' ? 'page' : undefined}
                onClick={() => openWorkspace({ kind: 'project' })}>Project details</button>
              <button type="button" aria-current={workspace.kind === 'projects' ? 'page' : undefined}
                onClick={() => openWorkspace({ kind: 'projects' })}>Manage projects</button>
            </nav>
            <div className="studio-workspace-body">
              {workspace.kind === 'project'
                ? <ProjectDetails project={project} meta={draft.meta} onChange={draft.updateProject} />
                : <ProjectManager projectId={projectId} title={project.title} meta={draft.meta} token={authToken}
                    project={project} dirty={draft.dirty} onOpenDetails={() => openWorkspace({ kind: 'project' })} />}
            </div>
          </main>
        )}

        {workspace.kind === 'product' && (
          <main className="editor-panel studio-workspace-view studio-workspace-view--product" aria-label="Edit product"
            inert={draft.publishing ? true : undefined}>
            <header className="studio-workspace-header">
              <div>
                <h2 ref={workspaceHeading} tabIndex={-1}>Edit product</h2>
                {product.owner && <span className="muted">{product.owner.label || 'Untitled hotspot'}</span>}
              </div>
              <button onClick={returnToHotspot}>Back to hotspot</button>
            </header>
            <div className="studio-workspace-body">
              {product.action ? (
                <ModelAuthoringEditor key={product.action.id} action={product.action} uploadAsset={draft.uploadAsset}
                  patchAction={(change) => patchModel(workspace, change)}
                  onModelStatus={handleModelStatus}
                  onDone={returnToHotspot}
                  onChooseModel={() => setAssetPicker({ ...workspace, type: 'model' })} />
              ) : <p className="muted" role="status">This product action was removed. Use Undo to restore it, or return to the scene.</p>}
            </div>
          </main>
        )}
      </div>

      {assetTarget && (!pickingModel || pickerProduct.action) && (
        <AssetPicker title={pickingModel ? 'Choose a 3D model' : 'Choose a panorama'} onClose={() => setAssetPicker(null)}>
          <p className="studio-asset-target">Apply to <strong>{(pickingModel ? pickerProduct.owner.label : assetTarget.title) || 'Untitled'}</strong></p>
          <AssetLibrary authToken={authToken} uploadAsset={draft.uploadAsset} projectContent={project}
            selectionType={assetPicker.type}
            onUseImage={!pickingModel ? (asset) => {
              patchScene(assetTarget.id, { image: asset.url, panorama: null })
              setAssetPicker(null)
            } : undefined}
            onUseModel={pickingModel ? (asset) => {
              patchModel(assetPicker, (current) => replaceProductModel(current, asset.url))
              setAssetPicker(null)
            } : undefined}
          />
        </AssetPicker>
      )}

      {preview && (
        <section className="studio-preview" aria-label="Draft preview">
          <header className="editor-topbar studio-header">
            <button onClick={exitPreview}>Back to editing</button>
            <div className="studio-preview-title"><strong>Draft preview</strong><span>{previewScene?.title || 'Untitled scene'}</span></div>
            <div className="studio-commands">
              <button onClick={() => setPreview((current) => ({ ...current, sceneId: current.initialSceneId, run: current.run + 1 }))}>Restart</button>
              <button
                disabled={!hasPanorama(preview.scenes.find((item) => item.id === preview.startSceneId))}
                onClick={() => setPreview((current) => ({ ...current, sceneId: current.startSceneId, initialSceneId: current.startSceneId, guideId: '', run: current.run + 1 }))}
              >Preview from start</button>
            </div>
          </header>
          <div className="studio-preview-viewport">
            <Viewer
              key={preview.run}
              sceneId={preview.sceneId}
              scenes={preview.scenes}
              guides={preview.guides}
              initialGuideId={preview.guideId}
              initialGuideStepId={preview.guideStepId}
              showGuideMenu={preview.settings.showGuideMenu}
              openLinksInNewTab
              onNavigate={(id) => setPreview((current) => ({ ...current, sceneId: id }))}
            />
          </div>
        </section>
      )}

      {reviewOpen && (
        <PublishReviewDialog
          title={project.title} issues={issues} warnings={warnings} checkingMedia={checkingMedia}
          scenes={scenes} startSceneId={project.startSceneId}
          busy={draft.publishing} error={error} onResolve={resolveIssue} onPreview={() => openPreview(startSceneId, previewButton.current, projectViewerSettings(project).defaultGuideId)}
          onPublish={publish} onClose={() => setReviewOpen(false)}
        />
      )}
      {share && (
        <PublishShareDialog
          projectId={projectId} projectTitle={share.manifest?.title || project.title}
          sceneCount={share.manifest?.scenes?.length ?? scenes.length}
          guideCount={share.manifest?.guides?.length ?? guides.length}
          startSceneTitle={(share.manifest?.scenes || scenes).find((item) => item.id === (share.manifest?.startSceneId || startSceneId))?.title}
          revision={share.manifest?.revision || share.meta?.publishedRevision}
          publishedAt={share.manifest?.publishedAt || share.meta?.publishedAt}
          onClose={() => setShare(null)}
        />
      )}
    </div>
  )
}
