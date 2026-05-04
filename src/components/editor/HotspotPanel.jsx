import React, { useEffect, useState } from 'react'

const SHAPES = [
  { value: 'sphere', icon: '⬤', label: 'Sphere' },
  { value: 'circle', icon: '◯', label: 'Circle' },
  { value: 'arrow',  icon: '▲', label: 'Arrow'  },
  { value: 'oval',   icon: '⬭', label: 'Oval'   },
]

export default function HotspotPanel({ hotspot, scenes, currentSceneId, onUpdate, onDelete, onClose }) {
  const [label, setLabel] = useState(hotspot?.label ?? '')
  const [size, setSize] = useState(hotspot?.size ?? 1)

  // Reset local state when switching to a different hotspot
  useEffect(() => {
    setLabel(hotspot?.label ?? '')
    setSize(hotspot?.size ?? 1)
  }, [hotspot?.id])

  if (!hotspot) return null

  const otherScenes = scenes.filter((s) => s.id !== currentSceneId)

  // Every change is immediately propagated — no Save step needed for the panel
  function update(patch) {
    onUpdate({ ...hotspot, ...patch })
  }

  const yawDisplay = hotspot.position?.yaw?.toFixed(1) ?? '—'
  const pitchDisplay = hotspot.position?.pitch?.toFixed(1) ?? '—'

  return (
    <aside className="hotspot-panel">
      <div className="hotspot-panel__header">
        <span className="hotspot-panel__title">Hotspot</span>
        <button className="icon-btn" title="Close" onClick={onClose}>✕</button>
      </div>

      <label className="modal__label">
        Label
        <input
          className="modal__input"
          type="text"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value)
            update({ label: e.target.value })
          }}
          placeholder="e.g. Go to Hall"
        />
      </label>

      <label className="modal__label">
        Target Scene
        <select
          className="modal__input"
          value={hotspot.target ?? ''}
          onChange={(e) => update({ target: e.target.value })}
        >
          <option value="">— none —</option>
          {otherScenes.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      </label>

      <div className="modal__label">
        Shape
        <div className="shape-picker">
          {SHAPES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`shape-btn${hotspot.shape === s.value ? ' shape-btn--active' : ''}`}
              title={s.label}
              onClick={() => update({ shape: s.value })}
            >
              <span className="shape-btn__icon">{s.icon}</span>
              <span className="shape-btn__label">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="modal__label">
        Size — {parseFloat(size).toFixed(1)}×
        <input
          className="modal__range"
          type="range"
          min="0.3"
          max="5"
          step="0.1"
          value={size}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            setSize(v)
            update({ size: v })
          }}
        />
      </label>

      <div className="hotspot-panel__position">
        <span>Yaw: {yawDisplay}°</span>
        <span>Pitch: {pitchDisplay}°</span>
      </div>
      <p className="hotspot-panel__drag-hint">Drag hotspot in viewer to reposition</p>

      <div className="hotspot-panel__actions">
        <button className="btn btn--danger btn--sm" onClick={() => { onDelete(hotspot.id); onClose() }}>Delete</button>
      </div>
    </aside>
  )
}
