import React from 'react'

export default function ProductInspectorHUD({
  inspection,
  animations,
  status,
  onPlayAnimation,
  onResetRotation,
  onClose,
}) {
  if (!inspection) return null

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
        <div className="muted">Drag the model to rotate it. In VR, use gaze or a controller on the world buttons.</div>
      )}

      {animations.length > 0 && (
        <div className="product-inspector-hud__actions">
          {animations.map((name) => (
            <button key={name} type="button" onClick={() => onPlayAnimation(name)}>
              {name}
            </button>
          ))}
          <button type="button" onClick={onResetRotation}>Reset rotation</button>
        </div>
      )}
    </section>
  )
}
