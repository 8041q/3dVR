import React, { useMemo, useState } from 'react'
import { createGuide, createGuideStep } from '../../guides/guideSchema'

function moveItem(items, index, delta) {
  const nextIndex = index + delta
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  return next
}

export default function GuideEditor({ guides, scenes, onGuidesChange, uploadAsset }) {
  const [selectedGuideId, setSelectedGuideId] = useState(guides[0]?.id || '')
  const [uploadError, setUploadError] = useState('')

  const selectedGuide = guides.find((guide) => guide.id === selectedGuideId) || guides[0] || null

  const sceneMap = useMemo(() => new Map(scenes.map((scene) => [scene.id, scene])), [scenes])

  function updateGuide(nextGuide) {
    onGuidesChange(guides.map((guide) => guide.id === nextGuide.id ? nextGuide : guide))
  }

  function patchGuide(patch) {
    if (!selectedGuide) return
    updateGuide({ ...selectedGuide, ...patch })
  }

  function addGuide() {
    const guide = createGuide()
    onGuidesChange([...guides, guide])
    setSelectedGuideId(guide.id)
  }

  function removeGuide() {
    if (!selectedGuide) return
    const next = guides.filter((guide) => guide.id !== selectedGuide.id)
    onGuidesChange(next)
    setSelectedGuideId(next[0]?.id || '')
  }

  function addStep() {
    if (!selectedGuide) return
    const defaultScene = selectedGuide.steps.at(-1)?.sceneId || scenes[0]?.id || ''
    patchGuide({ steps: [...selectedGuide.steps, createGuideStep(defaultScene)] })
  }

  function patchStep(index, patch) {
    patchGuide({
      steps: selectedGuide.steps.map((step, stepIndex) => (
        stepIndex === index ? { ...step, ...patch } : step
      )),
    })
  }

  async function uploadNarration(index, file) {
    if (!file) return
    setUploadError('')
    try {
      const result = await uploadAsset(file)
      patchStep(index, { narrationUrl: result.url })
    } catch (error) {
      setUploadError(error.message || 'Narration upload failed')
    }
  }

  return (
    <div className="guide-editor">
      <div className="guide-editor__topline">
        <strong>Guides</strong>
        <button type="button" onClick={addGuide}>Add guide</button>
      </div>

      {guides.length === 0 && (
        <div className="muted">Create a guide to author a step-by-step exhibition experience.</div>
      )}

      {guides.length > 0 && (
        <div className="guide-list">
          {guides.map((guide) => (
            <button
              type="button"
              key={guide.id}
              className={guide.id === selectedGuide?.id ? 'active' : ''}
              onClick={() => setSelectedGuideId(guide.id)}
            >
              {guide.title || guide.id}
            </button>
          ))}
        </div>
      )}

      {selectedGuide && (
        <div className="guide-editor__body">
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

          <div className="button-row">
            <button type="button" onClick={addStep}>Add step</button>
            <button type="button" className="danger" onClick={removeGuide}>Delete guide</button>
          </div>

          {uploadError && <div className="error-text">{uploadError}</div>}

          <div className="guide-steps">
            {selectedGuide.steps.map((step, index) => {
              const stepScene = sceneMap.get(step.sceneId)
              const hotspots = stepScene?.hotspots || []
              const focusEnabled = Boolean(step.focus)
              const productHotspot = hotspots.find((hotspot) => (
                hotspot.id === step.autoActivateHotspotId || hotspot.id === step.highlightHotspotId
              ))
              const inspectionAction = productHotspot?.actions?.find((action) => action.type === 'inspect-model')
              const animationOptions = inspectionAction?.animationControls || []
              const variantOptions = inspectionAction?.materialVariants || []

              return (
                <div className="guide-step-card" key={step.id || index}>
                  <div className="guide-step-card__heading">
                    <strong>Step {index + 1}</strong>
                    <div className="compact-actions">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => patchGuide({ steps: moveItem(selectedGuide.steps, index, -1) })}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={index === selectedGuide.steps.length - 1}
                        onClick={() => patchGuide({ steps: moveItem(selectedGuide.steps, index, 1) })}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => patchGuide({
                          steps: selectedGuide.steps.filter((_, stepIndex) => stepIndex !== index),
                        })}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <label>
                    Step title
                    <input
                      value={step.title || ''}
                      onChange={(event) => patchStep(index, { title: event.target.value })}
                    />
                  </label>

                  <label>
                    Scene
                    <select
                      value={step.sceneId || ''}
                      onChange={(event) => patchStep(index, {
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
                      value={step.instruction || ''}
                      onChange={(event) => patchStep(index, { instruction: event.target.value })}
                    />
                  </label>

                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={focusEnabled}
                      onChange={(event) => patchStep(index, {
                        focus: event.target.checked ? { yaw: 0, pitch: 0 } : null,
                      })}
                    />
                    Guide the view toward a direction
                  </label>

                  {focusEnabled && (
                    <>
                      <div className="action-card__grid">
                      <label>
                        Focus yaw
                        <input
                          type="number"
                          step="1"
                          value={step.focus?.yaw ?? 0}
                          onChange={(event) => patchStep(index, {
                            focus: { ...step.focus, yaw: Number(event.target.value) },
                          })}
                        />
                      </label>
                      <label>
                        Focus pitch
                        <input
                          type="number"
                          step="1"
                          value={step.focus?.pitch ?? 0}
                          onChange={(event) => patchStep(index, {
                            focus: { ...step.focus, pitch: Number(event.target.value) },
                          })}
                        />
                      </label>
                      </div>
                      <button
                        type="button"
                        className="compact-button"
                        disabled={!step.highlightHotspotId}
                        onClick={() => {
                          const target = hotspots.find((hotspot) => hotspot.id === step.highlightHotspotId)
                          if (!target?.position) return
                          patchStep(index, {
                            focus: {
                              yaw: Number(target.position.yaw) || 0,
                              pitch: Number(target.position.pitch) || 0,
                            },
                          })
                        }}
                      >
                        Use highlighted hotspot direction
                      </button>
                    </>
                  )}

                  <label>
                    Highlight hotspot
                    <select
                      value={step.highlightHotspotId || ''}
                      onChange={(event) => patchStep(index, { highlightHotspotId: event.target.value })}
                    >
                      <option value="">None</option>
                      {hotspots.map((hotspot) => (
                        <option key={hotspot.id} value={hotspot.id}>{hotspot.label || hotspot.id}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Advance after visitor selects
                    <select
                      value={step.advanceOnHotspotId || ''}
                      onChange={(event) => patchStep(index, { advanceOnHotspotId: event.target.value })}
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
                      value={step.autoActivateHotspotId || ''}
                      onChange={(event) => patchStep(index, { autoActivateHotspotId: event.target.value })}
                    >
                      <option value="">None</option>
                      {hotspots.map((hotspot) => (
                        <option key={hotspot.id} value={hotspot.id}>{hotspot.label || hotspot.id}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Narration URL
                    <input
                      value={step.narrationUrl || ''}
                      onChange={(event) => patchStep(index, { narrationUrl: event.target.value })}
                      placeholder="/uploads/narration.mp3"
                    />
                  </label>

                  <label className="file-field">
                    Upload narration
                    <input
                      type="file"
                      accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"
                      onChange={(event) => uploadNarration(index, event.target.files?.[0])}
                    />
                  </label>

                  <label>
                    Auto advance after seconds
                    <input
                      type="number"
                      min="0"
                      max="300"
                      step="0.5"
                      value={(Number(step.autoAdvanceMs) || 0) / 1000}
                      onChange={(event) => patchStep(index, {
                        autoAdvanceMs: Math.max(0, Number(event.target.value) * 1000),
                      })}
                    />
                  </label>

                  <div className="subsection-card subsection-card--tight">
                    <strong>Product command</strong>
                    <div className="muted">If a product inspection is already open, this step can control it.</div>
                    <label>
                      Animation
                      {animationOptions.length > 0 ? (
                        <select
                          value={step.inspectionCommand?.animationClip || ''}
                          onChange={(event) => patchStep(index, {
                            inspectionCommand: {
                              ...step.inspectionCommand,
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
                          value={step.inspectionCommand?.animationClip || ''}
                          onChange={(event) => patchStep(index, {
                            inspectionCommand: {
                              ...step.inspectionCommand,
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
                          value={step.inspectionCommand?.variantId || ''}
                          onChange={(event) => patchStep(index, {
                            inspectionCommand: {
                              ...step.inspectionCommand,
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
                          value={step.inspectionCommand?.variantId || ''}
                          onChange={(event) => patchStep(index, {
                            inspectionCommand: {
                              ...step.inspectionCommand,
                              variantId: event.target.value,
                            },
                          })}
                          placeholder="Variant ID"
                        />
                      )}
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
