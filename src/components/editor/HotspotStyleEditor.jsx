import React from 'react'
import { HOTSPOT_PRESETS, normalizeHotspotStyle } from '../../hotspots/hotspotStyles'

export default function HotspotStyleEditor({ hotspot, onUpdate }) {
  const style = normalizeHotspotStyle(hotspot)

  function patchStyle(patch) {
    onUpdate({
      ...hotspot,
      style: {
        ...style,
        ...patch,
      },
    })
  }

  return (
    <div className="hotspot-style-editor">
      <div className="subsection-card__heading">
        <div>
          <strong>Appearance</strong>
          <div className="muted">Choose a marker style that matches where it is placed.</div>
        </div>
      </div>

      <div className="hotspot-style-picker">
        {HOTSPOT_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            className={style.preset === preset.id ? 'active hotspot-style-option' : 'hotspot-style-option'}
            onClick={() => patchStyle({ preset: preset.id, color: preset.defaultColor })}
            title={preset.description}
          >
            <span className={`hotspot-style-swatch hotspot-style-swatch--${preset.id}`} />
            <span>{preset.label}</span>
          </button>
        ))}
      </div>

      <div className="hotspot-style-controls">
        <label>
          Marker color
          <input
            type="color"
            value={style.color}
            onChange={(event) => patchStyle({ color: event.target.value })}
          />
        </label>
        <label>
          Opacity
          <input
            type="range"
            min="0.35"
            max="1"
            step="0.05"
            value={style.opacity}
            onChange={(event) => patchStyle({ opacity: Number(event.target.value) })}
          />
        </label>
      </div>

      <div className="muted hotspot-style-note">
        Guides flash the selected hotspot independently of this appearance, so style changes do not affect guide behavior.
      </div>
    </div>
  )
}
