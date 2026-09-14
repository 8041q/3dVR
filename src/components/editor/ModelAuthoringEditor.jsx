import React, { useState } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import {
  createAnimationControl,
  createMaterialVariant,
  createModelAnnotation,
} from '../../actions/actionTypes'

function updateAt(items, index, patch) {
  return items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
}

async function detectModelMetadata(url) {
  if (!url) throw new Error('Add or upload a GLB model first.')

  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const materials = new Set()
        gltf.scene?.traverse?.((child) => {
          if (!child.isMesh) return
          const list = Array.isArray(child.material) ? child.material : [child.material]
          for (const material of list) {
            if (material?.name) materials.add(material.name)
          }
        })
        resolve({
          clips: (gltf.animations || []).map((clip) => clip.name).filter(Boolean),
          materials: [...materials].sort(),
        })
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error('Could not inspect the GLB.')),
    )
  })
}

export default function ModelAuthoringEditor({ action, patchAction, uploadAsset }) {
  const [uploadError, setUploadError] = useState('')
  const [scanError, setScanError] = useState('')
  const [detectedClips, setDetectedClips] = useState([])
  const [detectedMaterials, setDetectedMaterials] = useState([])
  const [scanning, setScanning] = useState(false)

  const animationControls = Array.isArray(action.animationControls) ? action.animationControls : []
  const materialVariants = Array.isArray(action.materialVariants) ? action.materialVariants : []
  const annotations = Array.isArray(action.annotations) ? action.annotations : []

  async function uploadModel(file) {
    if (!file) return
    setUploadError('')

    try {
      const result = await uploadAsset(file)
      patchAction({ modelUrl: result.url })
      setDetectedClips([])
      setDetectedMaterials([])
    } catch (error) {
      setUploadError(error.message || 'Model upload failed')
    }
  }

  async function scanClips() {
    setScanError('')
    setScanning(true)
    try {
      const metadata = await detectModelMetadata(action.modelUrl)
      setDetectedClips(metadata.clips)
      setDetectedMaterials(metadata.materials)
    } catch (error) {
      setScanError(error.message || 'Could not inspect the model animations.')
    } finally {
      setScanning(false)
    }
  }

  function addAnimationControl(clip = '') {
    const control = createAnimationControl()
    control.clip = clip
    control.label = clip || 'Animation'
    patchAction({ animationControls: [...animationControls, control] })
  }

  return (
    <div className="model-authoring">
      <label>
        Product title
        <input
          value={action.title || ''}
          onChange={(event) => patchAction({ title: event.target.value })}
          placeholder="Bed model"
        />
      </label>

      <label>
        GLB model URL
        <input
          value={action.modelUrl || ''}
          onChange={(event) => {
            patchAction({ modelUrl: event.target.value })
            setDetectedClips([])
            setDetectedMaterials([])
          }}
          placeholder="/uploads/model.glb"
        />
      </label>

      <label className="file-field">
        Upload GLB
        <input
          type="file"
          accept="model/gltf-binary,.glb"
          onChange={(event) => uploadModel(event.target.files?.[0])}
        />
      </label>

      {uploadError && <div className="error-text">{uploadError}</div>}

      <div className="action-card__grid">
        <label>
          Model scale
          <input
            type="number"
            min="0.05"
            max="20"
            step="0.05"
            value={action.modelScale ?? 1}
            onChange={(event) => patchAction({ modelScale: Number(event.target.value) })}
          />
        </label>
        <label>
          Y rotation
          <input
            type="number"
            step="5"
            value={action.rotationY ?? 0}
            onChange={(event) => patchAction({ rotationY: Number(event.target.value) })}
          />
        </label>
      </div>

      <div className="subsection-card">
        <div className="subsection-card__heading">
          <div>
            <strong>Animation controls</strong>
            <div className="muted">Rename technical GLB clips into customer-facing actions.</div>
          </div>
          <button type="button" onClick={scanClips} disabled={!action.modelUrl || scanning}>
            {scanning ? 'Scanning...' : 'Scan model'}
          </button>
        </div>

        {scanError && <div className="error-text">{scanError}</div>}

        {detectedClips.length > 0 && (
          <div className="detected-clips">
            {detectedClips.map((clip) => (
              <button key={clip} type="button" onClick={() => addAnimationControl(clip)}>
                Add {clip}
              </button>
            ))}
          </div>
        )}

        {animationControls.map((control, index) => (
          <div className="mini-card" key={control.id || `${control.clip}-${index}`}>
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
                GLB clip
                <input
                  value={control.clip || ''}
                  list={`clips-${action.id}`}
                  onChange={(event) => patchAction({
                    animationControls: updateAt(animationControls, index, { clip: event.target.value }),
                  })}
                />
              </label>
            </div>
            <button
              type="button"
              className="danger compact-button"
              onClick={() => patchAction({
                animationControls: animationControls.filter((_, itemIndex) => itemIndex !== index),
              })}
            >
              Remove animation control
            </button>
          </div>
        ))}

        <datalist id={`clips-${action.id}`}>
          {detectedClips.map((clip) => <option key={clip} value={clip} />)}
        </datalist>

        <div className="button-row">
          <button type="button" onClick={() => addAnimationControl()}>Add animation control</button>
        </div>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={action.exposeAnimations !== false}
            onChange={(event) => patchAction({ exposeAnimations: event.target.checked })}
          />
          Also show unmapped animation clips
        </label>
      </div>

      <div className="subsection-card">
        <div className="subsection-card__heading">
          <div>
            <strong>Material variants</strong>
            <div className="muted">Create simple fabric or finish choices by recoloring named GLB materials.</div>
          </div>
          <button
            type="button"
            onClick={() => patchAction({ materialVariants: [...materialVariants, createMaterialVariant()] })}
          >
            Add variant
          </button>
        </div>

        {materialVariants.map((variant, index) => (
          <div className="mini-card" key={variant.id || index}>
            <label>
              Customer label
              <input
                value={variant.label || ''}
                onChange={(event) => patchAction({
                  materialVariants: updateAt(materialVariants, index, { label: event.target.value }),
                })}
              />
            </label>
            <div className="action-card__grid">
              <label>
                Material name
                <input
                  list={`materials-${action.id}`}
                  value={variant.materialName || '*'}
                  onChange={(event) => patchAction({
                    materialVariants: updateAt(materialVariants, index, { materialName: event.target.value }),
                  })}
                  placeholder="* for all materials"
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={variant.color || '#ffffff'}
                  onChange={(event) => patchAction({
                    materialVariants: updateAt(materialVariants, index, { color: event.target.value }),
                  })}
                />
              </label>
            </div>
            <button
              type="button"
              className="danger compact-button"
              onClick={() => patchAction({
                materialVariants: materialVariants.filter((_, itemIndex) => itemIndex !== index),
              })}
            >
              Remove variant
            </button>
          </div>
        ))}
        <datalist id={`materials-${action.id}`}>
          <option value="*" />
          {detectedMaterials.map((name) => <option key={name} value={name} />)}
        </datalist>
        {detectedMaterials.length > 0 && (
          <div className="muted">Detected materials: {detectedMaterials.join(', ')}</div>
        )}
      </div>

      <div className="subsection-card">
        <div className="subsection-card__heading">
          <div>
            <strong>Model annotations</strong>
            <div className="muted">Attach selectable detail notes to normalized model coordinates.</div>
          </div>
          <button
            type="button"
            onClick={() => patchAction({ annotations: [...annotations, createModelAnnotation()] })}
          >
            Add annotation
          </button>
        </div>

        {annotations.map((annotation, index) => {
          const position = Array.isArray(annotation.position) ? annotation.position : [0, 0.8, 0]
          return (
            <div className="mini-card" key={annotation.id || index}>
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
                          annotations: updateAt(annotations, index, { position: nextPosition }),
                        })
                      }}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="danger compact-button"
                onClick={() => patchAction({
                  annotations: annotations.filter((_, itemIndex) => itemIndex !== index),
                })}
              >
                Remove annotation
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
