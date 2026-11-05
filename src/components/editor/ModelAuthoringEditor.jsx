import Select from '../ui/Select'
import React, { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import {
  createAnimationControl,
  createMaterialVariant,
  createModelAnnotation,
} from '../../actions/actionTypes'
import { detectModelMetadata, replaceProductModel } from '../../product/modelMetadata'
import ModelAnnotationPlacementDialog from './ModelAnnotationPlacementDialog'
import ProductModelPreview from './ProductModelPreview'
import { InspectionSurface } from '../product/ProductInspection'
import { openingViewPatch } from '../../product/authoringWorkflow'

const PRODUCT_SECTIONS = [
  ['model', 'Model', 'Choose a file and name', 'Choose the model visitors will inspect.'],
  ['placement', 'Starting view', 'Set the first angle', 'Drag to choose the angle visitors see first. Your angle and zoom are saved when you continue.'],
  ['options', 'Interactions', 'Add optional features', 'Choose a feature to configure. You can leave any feature unchanged.'],
  ['review', 'Preview', 'Try the visitor experience', 'Check the model and its interactions, then return to your hotspot.'],
]
const INTERACTIONS = [
  ['animations', 'Animations', 'Let visitors play movements built into the model.'],
  ['finishes', 'Finishes', 'Offer colours, materials or textures to try.'],
  ['details', 'Detail points', 'Attach descriptions to points on the model.'],
]

function updateAt(items, index, patch) {
  return items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
}

function findAnnotationIndex(annotations, target) {
  return annotations.findIndex((annotation) => target.id ? annotation.id === target.id : annotation === target)
}

function materialTarget(value) {
  return String(value || '*').trim() || '*'
}

function ModelUrlInput({ url, onApply }) {
  const [value, setValue] = useState(url)
  const canApply = value.trim() !== url
  return (
    <div className="studio-product-source">
      <label>
        GLB model URL
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !canApply) return
            event.preventDefault()
            onApply(value.trim())
          }}
          placeholder="/uploads/model.glb"
        />
      </label>
      <button type="button" disabled={!canApply} onClick={() => onApply(value.trim())}>
        Apply URL
      </button>
    </div>
  )
}

function ViewerNumberField({ action, patchAction, field, label, min, max, step, fallback }) {
  return <label>{label}<input type="number" min={min} max={max} step={step} value={action.viewer?.[field] ?? fallback} onChange={(event) => patchAction({ viewer: { ...action.viewer, [field]: Number(event.target.value) } })} /></label>
}

export default function ModelAuthoringEditor({ action, patchAction, uploadAsset, onChooseModel, onModelStatus, onDone }) {
  const sectionId = useId()
  const modelInput = useRef(null)
  const openingView = useRef(null)
  const stepHeading = useRef(null)
  const stepContent = useRef(null)
  const [section, setSection] = useState('model')
  const [feature, setFeature] = useState(null)
  const [viewStatus, setViewStatus] = useState('loading')
  const [uploadError, setUploadError] = useState('')
  const [scan, setScan] = useState(null)
  const [scanAttempt, setScanAttempt] = useState(0)
  const [uploadingModel, setUploadingModel] = useState(false)
  const [annotationPlacement, setAnnotationPlacement] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const textureUploads = useRef(new Map())
  const reportStatus = useEffectEvent((status) => onModelStatus?.(status))

  const modelUrl = typeof action.modelUrl === 'string' ? action.modelUrl.trim() : ''
  const animationControls = Array.isArray(action.animationControls) ? action.animationControls : []
  const materialVariants = Array.isArray(action.materialVariants) ? action.materialVariants : []
  const annotations = Array.isArray(action.annotations) ? action.annotations : []
  const placingAnnotation = annotationPlacement?.modelUrl === modelUrl
    ? annotationPlacement.adding
      ? annotationPlacement.target
      : annotations[findAnnotationIndex(annotations, annotationPlacement.target)]
    : null
  const modelStatus = modelUrl && scan?.url === modelUrl && scan.attempt === scanAttempt ? scan : null
  const currentMetadata = modelStatus?.metadata
  const detectedClips = currentMetadata?.clips || []
  const detectedMaterials = currentMetadata?.materials || []
  const unmatchedClip = detectedClips.find((clip) => !animationControls.some((control) => control.clip === clip))
  const missingClips = currentMetadata ? animationControls.filter((control) => !detectedClips.includes(control.clip)) : []
  const missingMaterials = currentMetadata ? materialVariants.filter((variant) => {
    const name = materialTarget(variant.materialName)
    return name !== '*' && !detectedMaterials.includes(name)
  }) : []
  const reviewAnnotations = annotations.filter((annotation) =>
    annotation.needsPlacementReview || (currentMetadata && annotation.anchorNode && !currentMetadata.nodes.includes(annotation.anchorNode)),
  )
  const stepIndex = PRODUCT_SECTIONS.findIndex(([id]) => id === section)
  const step = PRODUCT_SECTIONS[stepIndex]
  const featureInfo = INTERACTIONS.find(([id]) => id === feature)
  const modelReady = modelStatus?.state === 'ready'

  function focusStep() {
    requestAnimationFrame(() => {
      stepHeading.current?.focus({ preventScroll: true })
      stepContent.current?.scrollTo({ top: 0 })
    })
  }

  function selectSection(next) {
    if (section === 'placement' && next !== section) {
      const view = openingView.current?.getView()
      if (view) patchAction((current) => openingViewPatch(current, view))
    }
    setSection(next)
    setFeature(null)
    if (next === 'review') setPreviewOpen(true)
    focusStep()
  }

  function selectFeature(next) { setFeature(next); focusStep() }

  useEffect(() => {
    setAnnotationPlacement(null)
    setPreviewOpen(false)
  }, [modelUrl])

  useEffect(() => {
    if (!modelUrl) return undefined
    const request = new AbortController()
    reportStatus({ url: modelUrl, state: 'loading' })
    detectModelMetadata(modelUrl, { signal: request.signal })
      .then((metadata) => {
        if (request.signal.aborted) return
        setScan({ url: modelUrl, attempt: scanAttempt, state: 'ready', metadata })
        reportStatus({ url: modelUrl, state: 'ready' })
      })
      .catch((error) => {
        if (request.signal.aborted) return
        const message = error.message || 'Check the model URL or replace the GLB.'
        setScan({ url: modelUrl, attempt: scanAttempt, state: 'error', error: message })
        reportStatus({ url: modelUrl, state: 'error', error: message })
      })
    return () => request.abort()
  }, [modelUrl, scanAttempt])

  async function uploadModel(file) {
    if (!file) return
    setUploadError('')
    setUploadingModel(true)

    try {
      const result = await uploadAsset(file)
      patchAction((current) => current.modelUrl === action.modelUrl ? replaceProductModel(current, result.url) : null)
    } catch (error) {
      setUploadError(error.message || 'Model upload failed')
    } finally {
      setUploadingModel(false)
    }
  }

  async function uploadVariantTexture(variant, file) {
    if (!file) return
    setUploadError('')
    const key = variant.id || variant
    const request = {}
    textureUploads.current.set(key, request)

    try {
      const result = await uploadAsset(file)
      if (textureUploads.current.get(key) !== request) return
      patchAction((current) => {
        const variants = current.materialVariants || []
        const index = variants.findIndex((item) => variant.id ? item.id === variant.id : item === variant)
        if (index < 0 || variants[index].textureUrl !== variant.textureUrl) return null
        return { materialVariants: updateAt(variants, index, { textureUrl: result.url }) }
      })
    } catch (error) {
      if (textureUploads.current.get(key) === request) setUploadError(error.message || 'Texture upload failed')
    } finally {
      if (textureUploads.current.get(key) === request) textureUploads.current.delete(key)
    }
  }

  function addAnimationControl(clip) {
    const control = createAnimationControl()
    control.clip = clip
    control.label = clip
    patchAction({ animationControls: [...animationControls, control] })
  }

  function placeAnnotation(target, adding = false) {
    setAnnotationPlacement({ target, modelUrl, adding })
  }

  return (
    <div className="model-authoring">
      <div className="studio-product-toolbar">
        <nav className="studio-product-nav" aria-label="Product settings">
          {PRODUCT_SECTIONS.map(([id, title, subtitle], index) => (
            <button
              type="button"
              key={id}
              aria-current={section === id ? 'step' : undefined}
              aria-controls={`${sectionId}-content`}
              disabled={index > 0 && !modelReady}
              onClick={() => selectSection(id)}
            >
              <span className="studio-product-step-number">{index + 1}</span>
              <span><strong>{title}</strong><small>{subtitle}</small></span>
            </button>
          ))}
        </nav>
      </div>

      <div className="studio-product-step-content" id={`${sectionId}-content`} ref={stepContent}>
      <div className="studio-product-step-heading">
        {feature && <button type="button" onClick={() => selectFeature(null)}>← All interactions</button>}
        <span>Step {stepIndex + 1} of {PRODUCT_SECTIONS.length}{section === 'options' ? ' · Optional' : ''}</span>
        <h3 ref={stepHeading} tabIndex={-1}>{featureInfo?.[1] || step[1]}</h3>
        <p>{featureInfo?.[2] || step[3]}</p>
        {feature && <button type="button" onClick={() => setPreviewOpen(true)}>Preview {featureInfo[1].toLowerCase()}</button>}
      </div>

      {uploadError && <p className="error-text" role="alert">{uploadError}</p>}
      {modelUrl && !modelStatus && <p className="studio-product-notice muted" role="status">Checking model…</p>}
      {modelStatus?.state === 'error' && <div className="studio-product-notice" role="alert">
        <p className="error-text">Couldn’t load the model. {modelStatus.error}</p>
        <button type="button" onClick={() => setScanAttempt((value) => value + 1)}>Try again</button>
      </div>}
      {currentMetadata && (missingClips.length > 0 || missingMaterials.length > 0 || reviewAnnotations.length > 0) && (
        <p className="studio-product-notice studio-warning" role="status">
          Review saved controls for this model. {[
            missingClips.length ? `${missingClips.length} animation ${missingClips.length === 1 ? 'control' : 'controls'}` : '',
            missingMaterials.length ? `${missingMaterials.length} ${missingMaterials.length === 1 ? 'finish' : 'finishes'}` : '',
            reviewAnnotations.length ? `${reviewAnnotations.length} ${reviewAnnotations.length === 1 ? 'annotation' : 'annotations'}` : '',
          ].filter(Boolean).join(', ')} need attention.
        </p>
      )}

      <section className="studio-product-section" id={`${sectionId}-model`} hidden={section !== 'model'}>
        <label>
          Product title
          <input
            value={action.title || ''}
            onChange={(event) => patchAction({ title: event.target.value })}
            placeholder="Bed model"
          />
        </label>
        <div className="button-row">
          <button type="button" onClick={() => modelInput.current?.click()} disabled={uploadingModel}>
            {uploadingModel ? 'Uploading model…' : modelUrl ? 'Replace model' : 'Upload model'}
          </button>
          {onChooseModel && <button type="button" onClick={onChooseModel}>Choose from assets</button>}
        </div>
        {modelUrl && <div className="studio-product-file"><strong>{modelUrl.split('/').pop() || '3D model'}</strong><span>{currentMetadata ? `${detectedClips.length} ${detectedClips.length === 1 ? 'animation' : 'animations'} · ${detectedMaterials.length} ${detectedMaterials.length === 1 ? 'material' : 'materials'}` : 'Checking model…'}</span></div>}
        <details><summary>Use an external model link</summary><ModelUrlInput key={modelUrl} url={modelUrl} onApply={(url) => patchAction((current) => replaceProductModel(current, url))} /></details>
        <input
          ref={modelInput}
          type="file"
          hidden
          accept="model/gltf-binary,.glb"
          onChange={(event) => {
            uploadModel(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </section>

      <section className="studio-product-section" id={`${sectionId}-placement`} hidden={section !== 'placement'}>
        {section === 'placement' && modelUrl && <InspectionSurface ref={openingView} inspection={action} compact setup onStatusChange={(status) => setViewStatus(status.state)} />}
        <details className="studio-product-setting-group"><summary>Model orientation and visitor navigation</summary>
        <div className="studio-product-setting-body">
        <div className="action-card__grid">
          <label>Model up direction<Select value={action.viewer?.upAxis || 'y'} onChange={(event) => patchAction({ viewer: { ...action.viewer, upAxis: event.target.value } })}>
            <option value="y">Y up (standard)</option><option value="z">Z up</option><option value="x">X up</option>
          </Select></label>
          <label>Visitor rotation<Select value={action.viewer?.orbitMode || 'free'} onChange={(event) => patchAction({ viewer: { ...action.viewer, orbitMode: event.target.value } })}>
            <option value="free">Free orbit — all sides</option><option value="turntable">Turntable — horizontal only</option>
          </Select></label>
        </div>
        <label className="checkbox-field"><input type="checkbox" checked={action.viewer?.allowPan !== false} onChange={(event) => patchAction({ viewer: { ...action.viewer, allowPan: event.target.checked } })} />Allow visitors to pan the model</label>
        <label className="checkbox-field"><input type="checkbox" checked={Boolean(action.viewer?.autoRotate)} onChange={(event) => patchAction({ viewer: { ...action.viewer, autoRotate: event.target.checked } })} />Rotate automatically when visitors open the model</label>
        {action.viewer?.autoRotate && <ViewerNumberField action={action} patchAction={patchAction} field="autoRotateSpeed" label="Automatic rotation speed" min={0.1} max={3} step={0.1} fallback={0.65} />}
        </div></details>
        <details className="studio-product-setting-group"><summary>Zoom limits</summary>
          <div className="studio-product-setting-body action-card__grid">
            <ViewerNumberField action={action} patchAction={patchAction} field="minZoom" label="Minimum zoom" min={0.3} max={1.5} step={0.05} fallback={0.65} />
            <ViewerNumberField action={action} patchAction={patchAction} field="maxZoom" label="Maximum zoom" min={1} max={4} step={0.1} fallback={3} />
          </div>
        </details>
        <details className="studio-product-setting-group"><summary>Lighting and shadows</summary>
          <div className="studio-product-setting-body">
            <div className="action-card__grid">
              <ViewerNumberField action={action} patchAction={patchAction} field="exposure" label="Brightness" min={0.1} max={3} step={0.1} fallback={1} />
              <ViewerNumberField action={action} patchAction={patchAction} field="environmentIntensity" label="Environment light" min={0} max={4} step={0.1} fallback={1} />
              <ViewerNumberField action={action} patchAction={patchAction} field="shadowIntensity" label="Shadow strength" min={0} max={0.8} step={0.05} fallback={0.24} />
            </div>
            <label className="checkbox-field"><input type="checkbox" checked={action.viewer?.showGround !== false} onChange={(event) => patchAction({ viewer: { ...action.viewer, showGround: event.target.checked } })} />Show a soft shadow beneath the model</label>
          </div>
        </details>
        <details className="studio-product-setting-group"><summary>VR headset placement</summary>
          <div className="studio-product-setting-body action-card__grid">
            <label>Model size in VR<input type="number" min="0.05" max="20" step="0.05" value={action.modelScale ?? 1} onChange={(event) => patchAction({ modelScale: Number(event.target.value) })} /></label>
            <ViewerNumberField action={action} patchAction={patchAction} field="distance" label="Distance in VR (m)" min={1.5} max={4} step={0.1} fallback={2.35} />
            <ViewerNumberField action={action} patchAction={patchAction} field="backdropOpacity" label="VR backdrop strength" min={0} max={0.45} step={0.02} fallback={0.1} />
          </div>
        </details>
      </section>

      {section === 'options' && !feature && <div className="studio-product-features" id={`${sectionId}-options`}>
        {INTERACTIONS.map(([id, title, description], index) => <button type="button" key={id} className="studio-product-feature" onClick={() => selectFeature(id)}>
          <span className="studio-product-feature-body"><strong>{title}</strong><span>{description}</span><small>{id === 'animations' ? `${detectedClips.length} available in this model` : `${[detectedClips.length, materialVariants.length, annotations.length][index]} configured`}</small></span><span aria-hidden="true">→</span>
        </button>)}
      </div>}

      <section className="studio-product-section" hidden={section !== 'options' || feature !== 'animations'}>
        <p className="muted">Model animations are available to visitors by default. Add a custom label where it helps.</p>
        {!modelUrl && <p className="muted">Attach a GLB to choose from its animation clips.</p>}

        {currentMetadata && detectedClips.length === 0 && <p className="muted" role="status">The model contains no animation clips.</p>}

        {unmatchedClip && (
          <button type="button" onClick={() => addAnimationControl(unmatchedClip)}>Add custom animation label</button>
        )}

        {animationControls.map((control, index) => (
          <div className="studio-product-item" key={control.id || `${control.clip}-${index}`}>
            <div className="action-card__grid">
              <label>
                Button label
                <input
                  value={control.label || ''}
                  onChange={(event) => patchAction({
                    animationControls: updateAt(animationControls, index, { label: event.target.value }),
                  })}
                />
              </label>
              <label>
                Model animation
                <Select
                  value={control.clip || ''}
                  disabled={!currentMetadata || !detectedClips.length}
                  onChange={(event) => patchAction({
                    animationControls: updateAt(animationControls, index, { clip: event.target.value }),
                  })}
                >
                  <option value="" disabled>Choose a clip</option>
                  {control.clip && !detectedClips.includes(control.clip) && (
                    <option value={control.clip} disabled>
                      {control.clip}{currentMetadata ? ' (not in this model)' : ''}
                    </option>
                  )}
                  {detectedClips.map((clip) => <option key={clip} value={clip}>{clip}</option>)}
                </Select>
              </label>
            </div>
            <button
              type="button"
              className="danger compact-button"
              onClick={() => patchAction({
                animationControls: animationControls.filter((_, itemIndex) => itemIndex !== index),
              })}
            >
              Remove custom label
            </button>
          </div>
        ))}

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={action.exposeAnimations !== false}
            onChange={(event) => patchAction({ exposeAnimations: event.target.checked })}
          />
          Include other animations from this model
        </label>
        <ViewerNumberField action={action} patchAction={patchAction} field="animationSpeed" label="Playback speed" min={0.1} max={3} step={0.1} fallback={1} />
      </section>

      <section className="studio-product-section" hidden={section !== 'options' || feature !== 'finishes'}>
        <p className="muted">Create visitor-facing finishes with colour, texture and surface properties.</p>
        <button
          type="button"
          disabled={!currentMetadata}
          onClick={() => patchAction({ materialVariants: [...materialVariants, createMaterialVariant()] })}
        >
          Add finish
        </button>
        {!modelUrl && <p className="muted">Attach a GLB to choose its materials.</p>}

        {materialVariants.map((variant, index) => {
          const repeat = Array.isArray(variant.textureRepeat) ? variant.textureRepeat : [1, 1]
          const target = materialTarget(variant.materialName)
          return (
            <div className="studio-product-item" key={variant.id || index}>
              <div className="finish-preset-card__headline">
                <span
                  className="finish-preset-card__swatch"
                  style={{
                    backgroundColor: variant.color || '#ffffff',
                    backgroundImage: variant.textureUrl ? `url(${variant.textureUrl})` : undefined,
                  }}
                />
                <label>
                  Visitor label
                  <input
                    value={variant.label || ''}
                    onChange={(event) => patchAction({
                      materialVariants: updateAt(materialVariants, index, { label: event.target.value }),
                    })}
                    placeholder="Walnut, Sand, Dark grey..."
                  />
                </label>
              </div>

              <label>
                Apply to material
                <Select
                  value={target}
                  disabled={!currentMetadata}
                  onChange={(event) => patchAction({
                    materialVariants: updateAt(materialVariants, index, { materialName: event.target.value }),
                  })}
                >
                  <option value="*">All materials</option>
                  {target !== '*' && !detectedMaterials.includes(target) && (
                    <option value={target} disabled>{target}{currentMetadata ? ' (not in this model)' : ''}</option>
                  )}
                  {detectedMaterials.map((name) => <option key={name} value={name}>{name}</option>)}
                </Select>
              </label>

              <div className="action-card__grid">
                <label>
                  Tint colour
                  <input
                    type="color"
                    value={variant.color || '#ffffff'}
                    onChange={(event) => patchAction({
                      materialVariants: updateAt(materialVariants, index, { color: event.target.value }),
                    })}
                  />
                </label>
              </div>
              <details className="studio-product-setting-group"><summary>Texture and surface settings</summary><div className="studio-product-setting-body">
                <label className="file-field">
                  Upload texture
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      uploadVariantTexture(variant, event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </label>

              <label>
                Texture URL
                <input
                  value={variant.textureUrl || ''}
                  onChange={(event) => patchAction({
                    materialVariants: updateAt(materialVariants, index, { textureUrl: event.target.value }),
                  })}
                  placeholder="Optional image from the Library"
                />
              </label>

              <fieldset className="studio-product-fields">
                <legend>Surface settings</legend>
                <div className="action-card__grid">
                  <label>
                    Roughness
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={variant.roughness ?? ''}
                      placeholder="Original"
                      onChange={(event) => patchAction({
                        materialVariants: updateAt(materialVariants, index, {
                          roughness: event.target.value === '' ? null : Number(event.target.value),
                        }),
                      })}
                    />
                  </label>
                  <label>
                    Metalness
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={variant.metalness ?? ''}
                      placeholder="Original"
                      onChange={(event) => patchAction({
                        materialVariants: updateAt(materialVariants, index, {
                          metalness: event.target.value === '' ? null : Number(event.target.value),
                        }),
                      })}
                    />
                  </label>
                  <label>
                    Texture repeat X
                    <input
                      type="number"
                      min="0.01"
                      step="0.25"
                      value={repeat[0] ?? 1}
                      onChange={(event) => patchAction({
                        materialVariants: updateAt(materialVariants, index, {
                          textureRepeat: [Number(event.target.value) || 1, repeat[1] ?? 1],
                        }),
                      })}
                    />
                  </label>
                  <label>
                    Texture repeat Y
                    <input
                      type="number"
                      min="0.01"
                      step="0.25"
                      value={repeat[1] ?? 1}
                      onChange={(event) => patchAction({
                        materialVariants: updateAt(materialVariants, index, {
                          textureRepeat: [repeat[0] ?? 1, Number(event.target.value) || 1],
                        }),
                      })}
                    />
                  </label>
                </div>
              </fieldset>
              </div></details>

              <button
                type="button"
                className="danger compact-button"
                onClick={() => patchAction({
                  materialVariants: materialVariants.filter((_, itemIndex) => itemIndex !== index),
                })}
              >
                Remove finish
              </button>
            </div>
          )
        })}
      </section>

      <section className="studio-product-section" hidden={section !== 'options' || feature !== 'details'}>
        <p className="muted">Click a point on the model, then add its name and description. The numbered point follows animated parts.</p>
        <button
          type="button"
          onClick={() => placeAnnotation({ ...createModelAnnotation(), position: null }, true)}
          disabled={!modelUrl}
        >
          Add detail point
        </button>

        {annotations.map((annotation, index) => {
          const position = Array.isArray(annotation.position) ? annotation.position : [0, 0.8, 0]
          return (
            <div className="studio-product-item" key={annotation.id || index}>
              {reviewAnnotations.includes(annotation) && (
                <p className="studio-warning">Confirm where this annotation belongs on the current model.</p>
              )}
              <label>
                Label
                <input
                  value={annotation.label || ''}
                  onChange={(event) => patchAction({
                    annotations: updateAt(annotations, index, { label: event.target.value }),
                  })}
                />
              </label>
              <label>
                Detail text
                <textarea
                  rows="3"
                  value={annotation.body || ''}
                  onChange={(event) => patchAction({
                    annotations: updateAt(annotations, index, { body: event.target.value }),
                  })}
                />
              </label>
              <div className="annotation-card__placement">
                <button
                  type="button"
                  disabled={!modelUrl}
                  onClick={() => placeAnnotation(annotation)}
                >
                  Move point
                </button>
                <span className="muted">{reviewAnnotations.includes(annotation) ? 'Check placement' : 'Point placed on model'}</span>
              </div>
              <details>
                <summary>Precise coordinates</summary>
                <p className="muted">Editing coordinates fixes the point in place so it no longer follows an animated part.</p>
                <div className="annotation-position-grid">
                  {['X', 'Y', 'Z'].map((axis, axisIndex) => (
                    <label key={axis}>
                      {axis}
                      <input
                        type="number"
                        step="0.05"
                        value={position[axisIndex] ?? 0}
                        onChange={(event) => {
                          const nextPosition = [...position]
                          nextPosition[axisIndex] = Number(event.target.value)
                          patchAction({
                            annotations: updateAt(annotations, index, {
                              position: nextPosition,
                              anchorNode: '',
                              anchorPosition: null,
                              anchorNormal: null,
                              needsPlacementReview: false,
                            }),
                          })
                        }}
                      />
                    </label>
                  ))}
                </div>
              </details>
              <button
                type="button"
                className="danger compact-button"
                onClick={() => patchAction({
                  annotations: annotations.filter((_, itemIndex) => itemIndex !== index),
                })}
              >
                Remove detail point
              </button>
            </div>
          )
        })}
      </section>

      {section === 'review' && <section className="studio-product-section" id={`${sectionId}-review`}>
        <div className="studio-product-review-card">
          <strong>{action.title || 'Product'}</strong>
          <span>{modelUrl.split('/').pop()}</span>
          <ul>
            <li>Check the starting angle, rotation and zoom.</li>
            {detectedClips.length > 0 && <li>Try the product animations.</li>}
            {materialVariants.length > 0 && <li>Switch between the finishes.</li>}
            {annotations.length > 0 && <li>Open the numbered detail points.</li>}
          </ul>
          <button type="button" className="primary" onClick={() => setPreviewOpen(true)}>Open visitor preview</button>
        </div>
      </section>}
      </div>

      <footer className="studio-product-step-footer">
        <button type="button" disabled={stepIndex === 0} onClick={() => feature ? selectFeature(null) : selectSection(PRODUCT_SECTIONS[stepIndex - 1][0])}>{feature ? 'All interactions' : 'Back'}</button>
        <span>{section === 'review' ? 'Use Save draft in the header to keep your edits.' : feature ? 'Changes appear in your preview.' : `${stepIndex + 1} / ${PRODUCT_SECTIONS.length}`}</span>
        <button type="button" className="primary" disabled={!modelReady || (section === 'placement' && viewStatus !== 'ready')} onClick={() => {
          if (feature) selectFeature(null)
          else if (section === 'review') onDone?.()
          else selectSection(PRODUCT_SECTIONS[stepIndex + 1][0])
        }}>{feature ? `Done with ${featureInfo[1].toLowerCase()}` : section === 'review' ? 'Return to hotspot' : section === 'placement' ? 'Save view & continue' : `Continue to ${PRODUCT_SECTIONS[stepIndex + 1][1].toLowerCase()}`}</button>
      </footer>

      {placingAnnotation && (
        <ModelAnnotationPlacementDialog
          modelUrl={modelUrl}
          modelScale={action.modelScale ?? 1}
          upAxis={action.viewer?.upAxis || 'y'}
          annotation={placingAnnotation}
          requireNewPoint={reviewAnnotations.includes(placingAnnotation)}
          onClose={() => setAnnotationPlacement(null)}
          onConfirm={(point) => {
            patchAction((current) => {
              if (current.modelUrl?.trim?.() !== annotationPlacement.modelUrl) return null
              const items = current.annotations || []
              const placement = {
                label: point.label,
                body: point.body,
                position: point.position,
                normal: point.normal,
                anchorNode: point.anchorNode || '',
                anchorPosition: point.anchorPosition || null,
                anchorNormal: point.anchorNormal || null,
                needsPlacementReview: false,
              }
              if (annotationPlacement.adding) {
                return { annotations: [...items, { ...annotationPlacement.target, ...placement }] }
              }
              const index = findAnnotationIndex(items, annotationPlacement.target)
              if (index < 0) return null
              return { annotations: updateAt(items, index, placement) }
            })
            setAnnotationPlacement(null)
          }}
        />
      )}
      {previewOpen && modelUrl && (
        <ProductModelPreview
          action={{ ...action, modelUrl }}
          initialFeature={feature === 'animations' ? 'motion' : feature}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}
