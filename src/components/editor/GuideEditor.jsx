import React, { useEffect, useMemo, useState } from 'react'
import { createGuide, createGuideStep } from '../../guides/guideSchema'

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

function stepBadges(step) {
  const badges = []
  if (step.highlightHotspotId) badges.push('Highlight')
  if (step.narrationUrl) badges.push('Narration')
  if (Number(step.autoAdvanceMs) > 0) badges.push('Timed')
  if (step.autoActivateHotspotId) badges.push('Auto-open')
  if (step.inspectionCommand?.animationClip || step.inspectionCommand?.variantId) badges.push('Product')
  return badges
}

export default function GuideEditor({ guides, scenes, onGuidesChange, uploadAsset }) {
  const [selectedGuideId, setSelectedGuideId] = useState(guides[0]?.id || '')
  const [selectedStepId, setSelectedStepId] = useState(guides[0]?.steps?.[0]?.id || '')
  const [uploadError, setUploadError] = useState('')
  const [dragIndex, setDragIndex] = useState(null)

  const selectedGuide = guides.find((guide) => guide.id === selectedGuideId) || guides[0] || null
  const selectedStepIndex = selectedGuide?.steps?.findIndex((step) => step.id === selectedStepId) ?? -1
  const selectedStep = selectedStepIndex >= 0 ? selectedGuide.steps[selectedStepIndex] : selectedGuide?.steps?.[0] || null
  const actualStepIndex = selectedStep ? selectedGuide.steps.findIndex((step) => step.id === selectedStep.id) : -1
  const sceneMap = useMemo(() => new Map(scenes.map((scene) => [scene.id, scene])), [scenes])

  useEffect(() => {
    if (!selectedGuide) {
      setSelectedGuideId('')
      setSelectedStepId('')
      return
    }
    if (!selectedGuideId || !guides.some((guide) => guide.id === selectedGuideId)) {
      setSelectedGuideId(selectedGuide.id)
    }
    if (!selectedStep || !selectedGuide.steps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(selectedGuide.steps[0]?.id || '')
    }
  }, [guides, selectedGuide, selectedGuideId, selectedStep, selectedStepId])

  function updateGuide(nextGuide) {
    onGuidesChange(guides.map((guide) => guide.id === nextGuide.id ? nextGuide : guide))
  }

  function patchGuide(patch) {
    if (!selectedGuide) return
    updateGuide({ ...selectedGuide, ...patch })
  }

  function patchSelectedStep(patch) {
    if (!selectedGuide || !selectedStep) return
    patchGuide({
      steps: selectedGuide.steps.map((step) => (
        step.id === selectedStep.id ? { ...step, ...patch } : step
      )),
    })
  }

  function addGuide() {
    const guide = createGuide()
    onGuidesChange([...guides, guide])
    setSelectedGuideId(guide.id)
    setSelectedStepId('')
  }

  function removeGuide() {
    if (!selectedGuide) return
    const next = guides.filter((guide) => guide.id !== selectedGuide.id)
    onGuidesChange(next)
    setSelectedGuideId(next[0]?.id || '')
    setSelectedStepId(next[0]?.steps?.[0]?.id || '')
  }

  function addStep(afterIndex = selectedGuide?.steps?.length - 1) {
    if (!selectedGuide) return
    const sourceIndex = Math.max(-1, Number(afterIndex))
    const priorStep = selectedGuide.steps[sourceIndex] || selectedGuide.steps.at(-1)
    const defaultScene = priorStep?.sceneId || scenes[0]?.id || ''
    const step = createGuideStep(defaultScene)
    const next = [...selectedGuide.steps]
    next.splice(Math.min(sourceIndex + 1, next.length), 0, step)
    patchGuide({ steps: next })
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
    const next = [...selectedGuide.steps]
    next.splice(actualStepIndex + 1, 0, copy)
    patchGuide({ steps: next })
    setSelectedStepId(copy.id)
  }

  function deleteStep() {
    if (!selectedGuide || !selectedStep) return
    const next = selectedGuide.steps.filter((step) => step.id !== selectedStep.id)
    patchGuide({ steps: next })
    setSelectedStepId(next[Math.min(actualStepIndex, next.length - 1)]?.id || '')
  }

  function reorder(delta) {
    if (!selectedGuide || actualStepIndex < 0) return
    const next = moveItem(selectedGuide.steps, actualStepIndex, delta)
    patchGuide({ steps: next })
  }

  async function uploadNarration(file) {
    if (!file || !selectedStep) return
    setUploadError('')
    try {
      const result = await uploadAsset(file)
      patchSelectedStep({ narrationUrl: result.url })
    } catch (error) {
      setUploadError(error.message || 'Narration upload failed')
    }
  }

  const stepScene = selectedStep ? sceneMap.get(selectedStep.sceneId) : null
  const hotspots = stepScene?.hotspots || []
  const focusEnabled = Boolean(selectedStep?.focus)
  const productHotspot = hotspots.find((hotspot) => (
    hotspot.id === selectedStep?.autoActivateHotspotId || hotspot.id === selectedStep?.highlightHotspotId
  ))
  const inspectionAction = productHotspot?.actions?.find((action) => action.type === 'inspect-model')
  const animationOptions = inspectionAction?.animationControls || []
  const variantOptions = inspectionAction?.materialVariants || []

  return (
    <div className="guide-editor guide-editor--storyboard">
      <div className="guide-editor__topline">
        <div>
          <div className="editor-subheading">Guided experience</div>
          <div className="muted">Build the visitor journey one step at a time.</div>
        </div>
        <button type="button" onClick={addGuide}>New guide</button>
      </div>

      {guides.length === 0 && (
        <div className="editor-empty-state">
          No guides yet. Create one when you want to lead visitors through scenes, hotspots, narration or product actions.
        </div>
      )}

      {guides.length > 0 && (
        <div className="guide-picker-row">
          <label>
            Guide
            <select
              value={selectedGuide?.id || ''}
              onChange={(event) => {
                const guide = guides.find((item) => item.id === event.target.value)
                setSelectedGuideId(event.target.value)
                setSelectedStepId(guide?.steps?.[0]?.id || '')
              }}
            >
              {guides.map((guide) => (
                <option key={guide.id} value={guide.id}>{guide.title || guide.id}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {selectedGuide && (
        <>
          <details className="advanced-details guide-details" open={!selectedGuide.steps.length}>
            <summary>Guide details</summary>
            <label>
              Guide title
              <input
                value={selectedGuide.title || ''}
                onChange={(event) => patchGuide({ title: event.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                rows="3"
                value={selectedGuide.description || ''}
                onChange={(event) => patchGuide({ description: event.target.value })}
              />
            </label>
            <button type="button" className="danger compact-button" onClick={removeGuide}>Delete guide</button>
          </details>

          <div className="guide-storyboard-header">
            <div>
              <strong>Storyboard</strong>
              <div className="muted">Select a card to edit it. Drag cards to reorder.</div>
            </div>
            <button type="button" onClick={() => addStep(selectedGuide.steps.length - 1)}>Add step</button>
          </div>

          <div className="guide-storyboard" role="list" aria-label="Guide steps">
            {selectedGuide.steps.map((step, index) => {
              const scene = sceneMap.get(step.sceneId)
              return (
                <button
                  type="button"
                  role="listitem"
                  draggable
                  key={step.id}
                  className={step.id === selectedStep?.id ? 'guide-story-card active' : 'guide-story-card'}
                  onClick={() => setSelectedStepId(step.id)}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (dragIndex == null) return
                    patchGuide({ steps: moveItemTo(selectedGuide.steps, dragIndex, index) })
                    setDragIndex(null)
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <span className="guide-story-card__number">{index + 1}</span>
                  <span className="guide-story-card__body">
                    <strong>{step.title || `Step ${index + 1}`}</strong>
                    <small>{scene?.title || 'Keep current scene'}</small>
                    <span className="guide-story-card__badges">
                      {stepBadges(step).slice(0, 3).map((badge) => <em key={badge}>{badge}</em>)}
                    </span>
                  </span>
                </button>
              )
            })}

            <button
              type="button"
              className="guide-story-card guide-story-card--add"
              onClick={() => addStep(selectedGuide.steps.length - 1)}
            >
              <span>Add step</span>
            </button>
          </div>

          {uploadError && <div className="error-text">{uploadError}</div>}

          {selectedStep ? (
            <div className="guide-step-inspector">
              <div className="guide-step-inspector__header">
                <div>
                  <div className="editor-eyebrow">Step {actualStepIndex + 1}</div>
                  <strong>{selectedStep.title || `Step ${actualStepIndex + 1}`}</strong>
                </div>
                <div className="compact-actions">
                  <button type="button" disabled={actualStepIndex === 0} onClick={() => reorder(-1)}>Earlier</button>
                  <button
                    type="button"
                    disabled={actualStepIndex === selectedGuide.steps.length - 1}
                    onClick={() => reorder(1)}
                  >
                    Later
                  </button>
                </div>
              </div>

              <label>
                Step title
                <input
                  value={selectedStep.title || ''}
                  onChange={(event) => patchSelectedStep({ title: event.target.value })}
                />
              </label>

              <label>
                Scene
                <select
                  value={selectedStep.sceneId || ''}
                  onChange={(event) => patchSelectedStep({
                    sceneId: event.target.value,
                    highlightHotspotId: '',
                    advanceOnHotspotId: '',
                    autoActivateHotspotId: '',
                  })}
                >
                  <option value="">Keep current scene</option>
                  {scenes.map((scene) => (
                    <option key={scene.id} value={scene.id}>{scene.title || scene.id}</option>
                  ))}
                </select>
              </label>

              <label>
                Visitor instruction
                <textarea
                  rows="3"
                  value={selectedStep.instruction || ''}
                  onChange={(event) => patchSelectedStep({ instruction: event.target.value })}
                  placeholder="What should the visitor notice or do?"
                />
              </label>

              <div className="guide-step-section">
                <div className="guide-step-section__heading">
                  <strong>Attention</strong>
                  <span>Point the visitor toward the important part of this step.</span>
                </div>

                <label>
                  Highlight hotspot
                  <select
                    value={selectedStep.highlightHotspotId || ''}
                    onChange={(event) => patchSelectedStep({ highlightHotspotId: event.target.value })}
                  >
                    <option value="">None</option>
                    {hotspots.map((hotspot) => (
                      <option key={hotspot.id} value={hotspot.id}>{hotspot.label || hotspot.id}</option>
                    ))}
                  </select>
                </label>

                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={focusEnabled}
                    onChange={(event) => patchSelectedStep({
                      focus: event.target.checked ? { yaw: 0, pitch: 0 } : null,
                    })}
                  />
                  Guide the view toward a direction
                </label>

                {focusEnabled && (
                  <div className="guide-focus-editor">
                    <div className="action-card__grid">
                      <label>
                        Yaw
                        <input
                          type="number"
                          step="1"
                          value={selectedStep.focus?.yaw ?? 0}
                          onChange={(event) => patchSelectedStep({
                            focus: { ...selectedStep.focus, yaw: Number(event.target.value) },
                          })}
                        />
                      </label>
                      <label>
                        Pitch
                        <input
                          type="number"
                          step="1"
                          value={selectedStep.focus?.pitch ?? 0}
                          onChange={(event) => patchSelectedStep({
                            focus: { ...selectedStep.focus, pitch: Number(event.target.value) },
                          })}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="compact-button"
                      disabled={!selectedStep.highlightHotspotId}
                      onClick={() => {
                        const target = hotspots.find((hotspot) => hotspot.id === selectedStep.highlightHotspotId)
                        if (!target?.position) return
                        patchSelectedStep({
                          focus: {
                            yaw: Number(target.position.yaw) || 0,
                            pitch: Number(target.position.pitch) || 0,
                          },
                        })
                      }}
                    >
                      Point at highlighted hotspot
                    </button>
                  </div>
                )}
              </div>

              <div className="guide-step-section">
                <div className="guide-step-section__heading">
                  <strong>Progression</strong>
                  <span>Choose how this step finishes or opens content.</span>
                </div>
                <label>
                  Advance after visitor selects
                  <select
                    value={selectedStep.advanceOnHotspotId || ''}
                    onChange={(event) => patchSelectedStep({ advanceOnHotspotId: event.target.value })}
                  >
                    <option value="">Manual Next</option>
                    {hotspots.map((hotspot) => (
                      <option key={hotspot.id} value={hotspot.id}>{hotspot.label || hotspot.id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Auto-open hotspot on step entry
                  <select
                    value={selectedStep.autoActivateHotspotId || ''}
                    onChange={(event) => patchSelectedStep({ autoActivateHotspotId: event.target.value })}
                  >
                    <option value="">None</option>
                    {hotspots.map((hotspot) => (
                      <option key={hotspot.id} value={hotspot.id}>{hotspot.label || hotspot.id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Auto advance after seconds
                  <input
                    type="number"
                    min="0"
                    max="300"
                    step="0.5"
                    value={(Number(selectedStep.autoAdvanceMs) || 0) / 1000}
                    onChange={(event) => patchSelectedStep({
                      autoAdvanceMs: Math.max(0, Number(event.target.value) * 1000),
                    })}
                  />
                </label>
              </div>

              <div className="guide-step-section">
                <div className="guide-step-section__heading">
                  <strong>Narration</strong>
                  <span>Optional audio played during this step.</span>
                </div>
                <label>
                  Narration URL
                  <input
                    value={selectedStep.narrationUrl || ''}
                    onChange={(event) => patchSelectedStep({ narrationUrl: event.target.value })}
                    placeholder="/uploads/narration.mp3"
                  />
                </label>
                <label className="file-field">
                  Upload narration
                  <input
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"
                    onChange={(event) => uploadNarration(event.target.files?.[0])}
                  />
                </label>
              </div>

              <details className="advanced-details guide-product-command">
                <summary>Product command</summary>
                <div className="muted">If a product inspection is already open, this step can control it.</div>
                <label>
                  Animation
                  {animationOptions.length > 0 ? (
                    <select
                      value={selectedStep.inspectionCommand?.animationClip || ''}
                      onChange={(event) => patchSelectedStep({
                        inspectionCommand: {
                          ...selectedStep.inspectionCommand,
                          animationClip: event.target.value,
                        },
                      })}
                    >
                      <option value="">None</option>
                      {animationOptions.map((control) => (
                        <option key={control.id || control.clip} value={control.clip}>
                          {control.label || control.clip}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={selectedStep.inspectionCommand?.animationClip || ''}
                      onChange={(event) => patchSelectedStep({
                        inspectionCommand: {
                          ...selectedStep.inspectionCommand,
                          animationClip: event.target.value,
                        },
                      })}
                      placeholder="GLB animation clip"
                    />
                  )}
                </label>
                <label>
                  Material variant
                  {variantOptions.length > 0 ? (
                    <select
                      value={selectedStep.inspectionCommand?.variantId || ''}
                      onChange={(event) => patchSelectedStep({
                        inspectionCommand: {
                          ...selectedStep.inspectionCommand,
                          variantId: event.target.value,
                        },
                      })}
                    >
                      <option value="">None</option>
                      {variantOptions.map((variant) => (
                        <option key={variant.id} value={variant.id}>{variant.label || variant.id}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={selectedStep.inspectionCommand?.variantId || ''}
                      onChange={(event) => patchSelectedStep({
                        inspectionCommand: {
                          ...selectedStep.inspectionCommand,
                          variantId: event.target.value,
                        },
                      })}
                      placeholder="Variant ID"
                    />
                  )}
                </label>
              </details>

              <div className="guide-step-footer-actions">
                <button type="button" onClick={duplicateStep}>Duplicate step</button>
                <button type="button" className="danger" onClick={deleteStep}>Delete step</button>
              </div>
            </div>
          ) : (
            <div className="editor-empty-state">
              Add a step to begin the storyboard.
            </div>
          )}
        </>
      )}
    </div>
  )
}
