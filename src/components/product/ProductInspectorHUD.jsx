import React from 'react'
import { resolveAnimationControls } from '../../product/productControls'

export default function ProductInspectorHUD({
  inspection,
  animations,
  status,
  onPlayAnimation,
  onApplyVariant,
  onOpenAnnotation,
  onResetRotation,
  onResetMaterials,
  onClose,
}) {
  if (!inspection) return null

  const controls = resolveAnimationControls(inspection, animations)
  const variants = inspection.materialVariants || []
  const annotations = inspection.annotations || []

  return (
    <section className="product-inspector-hud" aria-label="Product inspection controls">
      <header>
        <div>
          <div className="product-inspector-hud__eyebrow">Product inspection</div>
          <strong>{inspection.title || 'Product'}</strong>
        </div>
        <button type="button" onClick={onClose}>Back</button>
      </header>

      {status?.state === 'loading' && (
        <div className="muted">Loading 3D model...</div>
      )}
      {status?.state === 'error' && (
        <div className="error-text">{status.error}</div>
      )}
      {status?.state === 'ready' && (
        <div className="muted">Drag the model to rotate it. In VR, use gaze or a controller on the world controls.</div>
      )}

      {controls.length > 0 && (
        <div className="product-inspector-hud__section">
          <span>Movement</span>
          <div className="product-inspector-hud__actions">
            {controls.map((control) => (
              <button key={control.id} type="button" onClick={() => onPlayAnimation(control.clip)}>
                {control.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {variants.length > 0 && (
        <div className="product-inspector-hud__section">
          <span>Finishes</span>
          <div className="product-inspector-hud__actions">
            {variants.map((variant) => (
              <button key={variant.id} type="button" onClick={() => onApplyVariant(variant.id)}>
                {variant.label || 'Finish'}
              </button>
            ))}
            <button type="button" onClick={onResetMaterials}>Original</button>
          </div>
        </div>
      )}

      {annotations.length > 0 && (
        <div className="product-inspector-hud__section">
          <span>Details</span>
          <div className="product-inspector-hud__actions">
            {annotations.map((annotation) => (
              <button key={annotation.id} type="button" onClick={() => onOpenAnnotation(annotation.id)}>
                {annotation.label || 'Detail'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="product-inspector-hud__actions">
        <button type="button" onClick={onResetRotation}>Reset rotation</button>
      </div>
    </section>
  )
}
