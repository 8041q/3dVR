import Select from '../ui/Select'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createGuide, createGuideStep } from '../../guides/guideSchema'
import { GUIDE_ADVANCE, guideAdvanceDelay, guideAdvanceMode, guideEntryAction, guideEntryChoices, guideProductTarget, guideStepTargetIssues } from '../../guides/guidePlayback'
import { ACTION_TYPES } from '../../actions/actionTypes'
import Viewer from '../Viewer'
import './guideEditor.css'

function moveItem(items, index, delta) {
  const nextIndex = index + delta
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  return next
}

function moveItemTo(items, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(Math.min(toIndex, next.length), 0, item)
  return next
}

function actionChoiceKey(hotspotId, actionId) {
  return JSON.stringify([hotspotId, actionId])
}

function StepViewfinder({ scene, step, active, onCapture, onHighlight }) {
  const camera = useRef({ yaw: step.focus?.yaw || 0, pitch: step.focus?.pitch || 0 })
  const [ready, setReady] = useState(false)
  const handlePanoramaStatus = useCallback((status) => setReady(status.state === 'ready'), [])
  const focus = useMemo(() => ({
    id: JSON.stringify([scene?.id, step.focus]),
    yaw: step.focus?.yaw || 0, pitch: step.focus?.pitch || 0,
  }), [scene?.id, step.focus])
  if (!scene?.image && !scene?.panorama?.manifestUrl) {
    return <p className="muted">Choose a scene with a panorama to set the starting view.</p>
  }
  return (
    <div className="guide-viewfinder">
      <p>Drag to choose where visitors look when this step starts. Click a hotspot to emphasize it.</p>
      {active && <div className="guide-viewfinder-canvas" aria-label="Starting view preview">
        <Viewer sceneId={scene.id} scenes={[scene]} editMode showModeBar={false}
          editorHighlightedHotspotId={step.highlightHotspotId} onSelectHotspot={onHighlight}
          editorFocusRequest={focus} editorViewRef={camera}
          onPanoramaStatus={handlePanoramaStatus} />
      </div>}
      <div className="button-row">
        <button type="button" className="primary" disabled={!ready} onClick={() => onCapture({ yaw: camera.current.yaw, pitch: camera.current.pitch })}>Save starting view</button>
        {step.focus && <button type="button" onClick={() => onCapture(null)}>Use scene default</button>}
      </div>
      <p className="muted" role="status">{step.focus ? 'A starting view is saved. Drag and save again to change it.' : 'Using the scene’s default starting view.'}</p>
    </div>
  )
}

export default function GuideEditor({ guides, scenes, onGuidesChange, currentSceneId, active, selectionRequest, onPreviewGuide }) {
  const [selectedGuideId, setSelectedGuideId] = useState(selectionRequest?.guideId || guides[0]?.id || '')
  const [selectedStepId, setSelectedStepId] = useState(selectionRequest?.stepId || '')
  const [draggedStepId, setDraggedStepId] = useState(null)
  const stepInspector = useRef(null)

  const selectedGuide = guides.find((guide) => guide.id === selectedGuideId) || guides[0] || null
  const selectedStepIndex = selectedGuide?.steps?.findIndex((step) => step.id === selectedStepId) ?? -1
  const selectedStep = selectedStepIndex >= 0 ? selectedGuide.steps[selectedStepIndex] : selectedGuide?.steps?.[0] || null
  const actualStepIndex = selectedStep ? selectedGuide.steps.findIndex((step) => step.id === selectedStep.id) : -1
  const sceneMap = useMemo(() => new Map(scenes.map((scene) => [scene.id, scene])), [scenes])

  useEffect(() => {
    if (!selectionRequest) return
    setSelectedGuideId(selectionRequest.guideId)
    setSelectedStepId(selectionRequest.stepId || '')
  }, [selectionRequest])

  function updateGuide(guideId, update) {
    onGuidesChange((current) => current.map((guide) => guide.id === guideId ? update(guide) : guide))
  }

  function patchGuide(patch) {
    if (!selectedGuide) return
    updateGuide(selectedGuide.id, (guide) => ({ ...guide, ...patch }))
  }

  function updateStep(guideId, stepId, update) {
    updateGuide(guideId, (guide) => ({
      ...guide,
      steps: guide.steps.map((step) => step.id === stepId ? update(step) : step),
    }))
  }

  function patchSelectedStep(patch) {
    if (!selectedGuide || !selectedStep) return
    updateStep(selectedGuide.id, selectedStep.id, (step) => ({ ...step, ...patch }))
  }

  function addGuide() {
    const guide = { ...createGuide(), steps: scenes.length ? [createGuideStep(currentSceneId || scenes[0].id)] : [] }
    onGuidesChange((current) => [...current, guide])
    setSelectedGuideId(guide.id)
    setSelectedStepId(guide.steps[0]?.id || '')
  }

  function removeGuide() {
    if (!selectedGuide) return
    const next = guides.filter((guide) => guide.id !== selectedGuide.id)
    onGuidesChange((current) => current.filter((guide) => guide.id !== selectedGuide.id))
    setSelectedGuideId(next[0]?.id || '')
    setSelectedStepId(next[0]?.steps?.[0]?.id || '')
  }

  function addStep() {
    if (!selectedGuide || !scenes.length) return
    const priorStep = selectedGuide.steps.at(-1)
    const defaultScene = [priorStep?.sceneId, currentSceneId, scenes[0].id].find((id) => sceneMap.has(id))
    const step = { ...createGuideStep(defaultScene), title: `Step ${selectedGuide.steps.length + 1}` }
    updateGuide(selectedGuide.id, (guide) => ({ ...guide, steps: [...guide.steps, step] }))
    setSelectedStepId(step.id)
  }

  function duplicateStep() {
    if (!selectedGuide || !selectedStep) return
    const copy = {
      ...selectedStep,
      id: globalThis.crypto?.randomUUID?.() || `guide-step-${Date.now()}`,
      title: `${selectedStep.title || 'Step'} copy`,
      focus: selectedStep.focus ? { ...selectedStep.focus } : null,
      inspectionCommand: { ...selectedStep.inspectionCommand },
    }
    updateGuide(selectedGuide.id, (guide) => {
      const index = guide.steps.findIndex((step) => step.id === selectedStep.id)
      if (index < 0) return guide
      const steps = [...guide.steps]
      steps.splice(index + 1, 0, copy)
      return { ...guide, steps }
    })
    setSelectedStepId(copy.id)
  }

  function deleteStep() {
    if (!selectedGuide || !selectedStep) return
    const next = selectedGuide.steps.filter((step) => step.id !== selectedStep.id)
    updateGuide(selectedGuide.id, (guide) => ({
      ...guide,
      steps: guide.steps.filter((step) => step.id !== selectedStep.id),
    }))
    setSelectedStepId(next[Math.min(actualStepIndex, next.length - 1)]?.id || '')
  }

  function reorder(delta) {
    if (!selectedGuide || actualStepIndex < 0) return
    updateGuide(selectedGuide.id, (guide) => {
      const index = guide.steps.findIndex((step) => step.id === selectedStep.id)
      return index < 0 ? guide : { ...guide, steps: moveItem(guide.steps, index, delta) }
    })
  }

  const stepScene = selectedStep ? sceneMap.get(selectedStep.sceneId) : null
  const hotspots = stepScene?.hotspots || []
  const advanceMode = guideAdvanceMode(selectedStep)
  const entryChoices = guideEntryChoices(stepScene)
  const entryAction = guideEntryAction(selectedStep, stepScene)
  const savedEntry = selectedStep?.autoActivateHotspotId || selectedStep?.autoActivateActionId
  const legacyEntry = entryAction && !selectedStep.autoActivateActionId
  const entryKey = legacyEntry ? 'saved-entry'
    : entryAction ? actionChoiceKey(selectedStep.autoActivateHotspotId, entryAction.id)
    : savedEntry ? 'unavailable-entry' : ''
  const productTarget = guideProductTarget(selectedStep, stepScene)
  const animationOptions = (productTarget?.action.animationControls || []).filter((item) => item.clip)
  const variantOptions = (productTarget?.action.materialVariants || []).filter((item) => item.id)
  const command = selectedStep?.inspectionCommand || {}
  const hasProductCommand = Boolean(command.animationClip || command.variantId)
  const targetIssues = selectedStep ? guideStepTargetIssues(selectedStep, stepScene) : []
  const requestedField = selectionRequest?.stepId === selectedStep?.id ? selectionRequest?.field : ''

  useEffect(() => {
    if (!requestedField || !active) return undefined
    const frame = requestAnimationFrame(() => {
      const target = [...(stepInspector.current?.querySelectorAll('[data-guide-field]') || [])]
        .find((element) => element.dataset.guideField === requestedField)
      if (target?.disabled) target.closest('details')?.querySelector('summary')?.focus()
      else target?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [active, requestedField, selectionRequest?.id])

  function hotspotOptions(selectedId) {
    return (
      <>
        {selectedId && !hotspots.some((hotspot) => hotspot.id === selectedId) && (
          <option value={selectedId} disabled>Saved hotspot unavailable in this scene</option>
        )}
        {hotspots.map((hotspot) => (
          <option key={hotspot.id} value={hotspot.id}>{hotspot.label || hotspot.id}</option>
        ))}
      </>
    )
  }

  function changeAdvanceMode(mode) {
    patchSelectedStep({
      advanceMode: mode,
      advanceOnHotspotId: [GUIDE_ADVANCE.HOTSPOT, GUIDE_ADVANCE.EITHER].includes(mode) ? selectedStep.advanceOnHotspotId || '' : '',
      autoAdvanceMs: [GUIDE_ADVANCE.TIMER, GUIDE_ADVANCE.EITHER].includes(mode) ? guideAdvanceDelay(selectedStep) || 5000 : 0,
    })
  }

  function changeEntry(key) {
    const choice = entryChoices.find(({ hotspot, action }) => actionChoiceKey(hotspot.id, action.id) === key)
    const sameProduct = choice && productTarget &&
      choice.hotspot.id === productTarget.hotspotId && choice.action.id === productTarget.action.id
    patchSelectedStep({
      autoActivateHotspotId: choice?.hotspot.id || '',
      autoActivateActionId: choice?.action.id || '',
      inspectionCommand: sameProduct ? command : { animationClip: '', variantId: '' },
    })
  }

  const needsHotspot = [GUIDE_ADVANCE.HOTSPOT, GUIDE_ADVANCE.EITHER, GUIDE_ADVANCE.LEGACY_BOTH].includes(advanceMode)
  const needsTimer = [GUIDE_ADVANCE.TIMER, GUIDE_ADVANCE.EITHER, GUIDE_ADVANCE.LEGACY_BOTH].includes(advanceMode)

  return (
    <div className="guide-editor guide-editor--storyboard">
      <div className="guide-editor__topline">
        <p className="muted">Build a tour one step at a time. Choose a scene, set the view, then decide how visitors continue.</p>
        <button type="button" onClick={addGuide}>New guide</button>
      </div>
      {!selectedGuide ? <div className="editor-empty-state">
        <h3>Create your first guided tour</h3><p>A guide takes visitors through your scenes in order. Each step can show a message or open a product.</p>
        <button type="button" className="primary" onClick={addGuide}>Create guide</button>
      </div> : <>
        <div className="guide-picker-row">
          <label>Guide<Select value={selectedGuide.id} onChange={(event) => {
            const guide = guides.find((item) => item.id === event.target.value)
            setSelectedGuideId(guide.id); setSelectedStepId(guide.steps[0]?.id || '')
          }}>{guides.map((guide) => <option key={guide.id} value={guide.id}>{guide.title || 'Untitled guide'}</option>)}</Select></label>
          <label>Guide name<input value={selectedGuide.title || ''} onChange={(event) => patchGuide({ title: event.target.value })} /></label>
          <button type="button" className="primary" disabled={!selectedGuide.steps.length} onClick={(event) => onPreviewGuide?.(selectedGuide.id, event.currentTarget)}>Play guide</button>
          <details className="guide-settings advanced-details"><summary>Guide settings</summary>
            <label>Description<textarea rows="2" value={selectedGuide.description || ''} onChange={(event) => patchGuide({ description: event.target.value })} /></label>
            <button type="button" className="danger" onClick={removeGuide}>Delete guide</button>
          </details>
        </div>
        <div className="guide-layout">
          <nav className="guide-sequence" aria-label="Guide steps">
            <div className="guide-storyboard-header"><strong>Steps · {selectedGuide.steps.length}</strong><button type="button" onClick={addStep} disabled={!scenes.length}>+ Add step</button></div>
            <p className="muted">Select a step. Drag steps to reorder.</p>
            <div className="guide-storyboard">
              {selectedGuide.steps.map((step, index) => <button type="button" draggable key={step.id}
                className={step.id === selectedStep?.id ? 'guide-story-card active' : 'guide-story-card'}
                aria-pressed={step.id === selectedStep?.id} onClick={() => setSelectedStepId(step.id)}
                onDragStart={() => setDraggedStepId(step.id)} onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); if (!draggedStepId) return
                  updateGuide(selectedGuide.id, (guide) => ({ ...guide, steps: moveItemTo(guide.steps, guide.steps.findIndex((item) => item.id === draggedStepId), guide.steps.findIndex((item) => item.id === step.id)) }))
                  setDraggedStepId(null)
                }} onDragEnd={() => setDraggedStepId(null)}>
                <span className="guide-story-card__number">{index + 1}</span>
                <span className="guide-story-card__body"><strong>{step.title || `Step ${index + 1}`}</strong><small>{sceneMap.get(step.sceneId)?.title || (step.sceneId ? 'Missing scene' : 'Current scene')}</small></span>
              </button>)}
            </div>
          </nav>
          {selectedStep ? <div className="guide-step-inspector" key={selectedStep.id} ref={stepInspector}>
            <header className="guide-step-inspector__header"><h3>Step {actualStepIndex + 1} of {selectedGuide.steps.length}</h3>
              <div className="compact-actions"><button type="button" disabled={actualStepIndex === 0} onClick={() => reorder(-1)}>Move up</button><button type="button" disabled={actualStepIndex === selectedGuide.steps.length - 1} onClick={() => reorder(1)}>Move down</button></div>
            </header>
            <section className="guide-step-section">
              <h3>1. Scene and message</h3>
              <p className="muted">Where should this step take the visitor, and what should they notice?</p>
              <label>Scene<Select data-guide-field="sceneId" value={selectedStep.sceneId || ''} onChange={(event) => patchSelectedStep({
                sceneId: event.target.value, focus: null, highlightHotspotId: '', advanceOnHotspotId: '',
                advanceMode: guideAdvanceDelay(selectedStep) ? GUIDE_ADVANCE.TIMER : GUIDE_ADVANCE.MANUAL,
                autoAdvanceMs: guideAdvanceDelay(selectedStep), autoActivateHotspotId: '', autoActivateActionId: '', inspectionCommand: { animationClip: '', variantId: '' },
              })}>
                {!selectedStep.sceneId && <option value="" disabled>Keep current scene (saved step)</option>}
                {selectedStep.sceneId && !stepScene && <option value={selectedStep.sceneId} disabled>Missing scene</option>}
                {scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.title || scene.id}</option>)}
              </Select></label>
              <label>Step title<input value={selectedStep.title || ''} onChange={(event) => patchSelectedStep({ title: event.target.value })} placeholder="e.g. Explore the patient room" /></label>
              <label>Message for visitors<textarea rows="3" value={selectedStep.instruction || ''} onChange={(event) => patchSelectedStep({ instruction: event.target.value })} placeholder="e.g. Select the bed to explore its features." /></label>
            </section>
            <section className="guide-step-section">
              <h3>2. What visitors see</h3>
              <StepViewfinder scene={stepScene} step={selectedStep} active={active} onCapture={(focus) => patchSelectedStep({ focus })} onHighlight={(id) => patchSelectedStep({ highlightHotspotId: id })} />
              <label>Emphasize a hotspot<Select data-guide-field="highlightHotspotId" value={selectedStep.highlightHotspotId || ''} disabled={!stepScene} onChange={(event) => patchSelectedStep({ highlightHotspotId: event.target.value })}>
                <option value="">No emphasis</option>{hotspotOptions(selectedStep.highlightHotspotId)}
              </Select></label>
              <p className="muted">{selectedStep.highlightHotspotId ? 'This hotspot is marked in the preview and will stand out during this step.' : 'Optional: make one hotspot stand out so visitors know where to interact.'}</p>
              {selectedStep.highlightHotspotId && <button type="button" disabled={!hotspots.find((item) => item.id === selectedStep.highlightHotspotId)?.position} onClick={() => {
                const position = hotspots.find((item) => item.id === selectedStep.highlightHotspotId)?.position
                if (position) patchSelectedStep({ focus: { yaw: Number(position.yaw) || 0, pitch: Number(position.pitch) || 0 } })
              }}>Start facing this hotspot</button>}
            </section>
            <section className="guide-step-section">
              <h3>3. What happens next</h3>
              <label>When this step starts<Select data-guide-field="autoActivateHotspotId" value={entryKey} onChange={(event) => changeEntry(event.target.value)}>
                <option value="">Show the message and panorama</option>
                {legacyEntry && <option value="saved-entry" disabled>Saved action · {entryAction.title || 'Open hotspot'}</option>}
                {savedEntry && !entryAction && <option value="unavailable-entry" disabled>Saved action unavailable</option>}
                {entryChoices.map(({ hotspot, action }) => <option key={actionChoiceKey(hotspot.id, action.id)} value={actionChoiceKey(hotspot.id, action.id)}>{action.type === ACTION_TYPES.INSPECT_MODEL ? 'Open product' : 'Show information'} · {hotspot.label || hotspot.id}{action.title ? ` · ${action.title}` : ''}</option>)}
              </Select></label>
              <p className="muted">{entryAction ? 'This opens automatically after the scene loads.' : 'Visitors explore the scene themselves. Choose a product or information hotspot above to open it automatically.'}</p>
              {(productTarget?.autoOpen || hasProductCommand) && <div className="guide-product-settings">
                <strong>Product presentation</strong>
                {!productTarget?.autoOpen && <p className="muted">These saved settings apply when the visitor opens the emphasized product.</p>}
                {(animationOptions.length > 0 || command.animationClip) && <label>Play an animation<Select data-guide-field="inspectionCommand" value={command.animationClip || ''} onChange={(event) => patchSelectedStep({ inspectionCommand: { ...command, animationClip: event.target.value } })}>
                  <option value="">Keep the product still</option>
                  {command.animationClip && !animationOptions.some((item) => item.clip === command.animationClip) && <option value={command.animationClip} disabled>Unavailable · {command.animationClip}</option>}
                  {animationOptions.map((control) => <option key={control.id || control.clip} value={control.clip}>{control.label || control.clip}</option>)}
                </Select></label>}
                {(variantOptions.length > 0 || command.variantId) && <label>Show a finish<Select data-guide-field="inspectionCommand" value={command.variantId || ''} onChange={(event) => patchSelectedStep({ inspectionCommand: { ...command, variantId: event.target.value } })}>
                  <option value="">Original finish</option>
                  {command.variantId && !variantOptions.some((item) => item.id === command.variantId) && <option value={command.variantId} disabled>Unavailable · {command.variantId}</option>}
                  {variantOptions.map((variant) => <option key={variant.id} value={variant.id}>{variant.label || variant.id}</option>)}
                </Select></label>}
              </div>}
              <label>Continue to the next step<Select value={advanceMode === GUIDE_ADVANCE.LEGACY_BOTH ? GUIDE_ADVANCE.EITHER : advanceMode} onChange={(event) => changeAdvanceMode(event.target.value)}>
                <option value={GUIDE_ADVANCE.MANUAL}>Visitor presses Next</option>
                <option value={GUIDE_ADVANCE.HOTSPOT} disabled={!stepScene}>Visitor selects a hotspot</option>
                <option value={GUIDE_ADVANCE.TIMER}>After a delay</option>
                <option value={GUIDE_ADVANCE.EITHER} disabled={!stepScene}>Hotspot selection or a delay, whichever comes first</option>
              </Select></label>
              {needsHotspot && <label>Hotspot that continues the guide<Select data-guide-field="advanceOnHotspotId" value={selectedStep.advanceOnHotspotId || ''} onChange={(event) => patchSelectedStep({ advanceOnHotspotId: event.target.value })}><option value="">Choose a hotspot</option>{hotspotOptions(selectedStep.advanceOnHotspotId)}</Select></label>}
              {needsTimer && <label>Wait this many seconds<input data-guide-field="autoAdvanceMs" type="number" min="0.5" max="300" step="0.5" value={guideAdvanceDelay(selectedStep) / 1000 || ''} onChange={(event) => patchSelectedStep({ autoAdvanceMs: Number(event.target.value) * 1000 })} /></label>}
              <p className="muted">{needsHotspot && needsTimer ? 'The first trigger continues the guide. Visitors can also press Next.' : needsHotspot ? 'Selecting this hotspot runs its action and continues the guide. Next is also available.' : needsTimer ? 'The countdown starts after the scene loads. Visitors can also press Next.' : 'Visitors stay on this step until they choose Next.'}{actualStepIndex === selectedGuide.steps.length - 1 ? ' This is the last step, so continuing finishes the guide.' : ''}</p>
            </section>
            {targetIssues.map(({ field, message, severity }) => <p key={`${field}-${message}`} className={severity === 'error' ? 'error-text' : 'studio-warning'} role="status">{message}</p>)}
            <footer className="guide-step-footer-actions">
              <button type="button" className="primary" onClick={(event) => onPreviewGuide?.(selectedGuide.id, event.currentTarget, selectedStep.id)}>Play from this step</button>
              <button type="button" onClick={duplicateStep}>Duplicate step</button>
              <button type="button" className="danger" onClick={deleteStep}>Delete step</button>
            </footer>
          </div> : <div className="editor-empty-state"><h3>Add the first step</h3><p>Each step takes visitors to a scene and tells them what to explore.</p><button type="button" onClick={addStep} disabled={!scenes.length}>Add step</button></div>}
        </div>
      </>}
    </div>
  )
}
