import React, { useEffect, useState } from 'react'

export default function HotspotPanel({ hotspot, onUpdate, onDelete, onClose }) {
  const [label, setLabel] = useState(hotspot?.label ?? '')
  const [size, setSize] = useState(hotspot?.size ?? 1)

  useEffect(() => {
    setLabel(hotspot?.label ?? '')
    setSize(hotspot?.size ?? 1)
  }, [hotspot?.id])

  if (!hotspot) return null

  function update(patch) {
    onUpdate({ ...hotspot, ...patch })
  }

  return (
    <aside className="hotspot-panel">
      <div className="hotspot-panel__header">
        <span className="hotspot-panel__title">Hotspot</span>
        <button className="icon-btn" title="Close" onClick={onClose}>Close</button>
      </div>

      <label className="modal__label">
        Label
        <input
          className="modal__input"
          type="text"
          value={label}
          onChange={(event) => {
            setLabel(event.target.value)
            update({ label: event.target.value })
          }}
        />
      </label>

      <label className="modal__label">
        Size - {parseFloat(size).toFixed(1)}x
        <input
          className="modal__range"
          type="range"
          min="0.3"
          max="5"
          step="0.1"
          value={size}
          onChange={(event) => {
            const value = parseFloat(event.target.value)
            setSize(value)
            update({ size: value })
          }}
        />
      </label>

      <div className="hotspot-panel__position">
        <span>Yaw: {hotspot.position?.yaw?.toFixed(1) ?? '-'} deg</span>
        <span>Pitch: {hotspot.position?.pitch?.toFixed(1) ?? '-'} deg</span>
      </div>

      <div className="hotspot-panel__actions">
        <button className="btn btn--danger btn--sm" onClick={() => { onDelete(hotspot.id); onClose() }}>
          Delete
        </button>
      </div>
    </aside>
  )
}
