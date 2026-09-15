export const HOTSPOT_PRESETS = [
  { id: 'navigation', label: 'Navigation', description: 'Directional marker for moving between scenes.', defaultColor: '#f5f7fa' },
  { id: 'floor', label: 'Floor', description: 'Wide oval marker suited to walkable floor positions.', defaultColor: '#f5f7fa' },
  { id: 'doorway', label: 'Doorway', description: 'Tall marker for doors, entrances and passages.', defaultColor: '#f5f7fa' },
  { id: 'window', label: 'Window', description: 'Framed marker for windows and openings.', defaultColor: '#cfe8ff' },
  { id: 'product', label: 'Product', description: 'Distinct marker for inspectable products.', defaultColor: '#ffe7a8' },
  { id: 'info', label: 'Information', description: 'Compact marker for information and details.', defaultColor: '#cce8ff' },
]

export const HOTSPOT_PRESET_IDS = new Set(HOTSPOT_PRESETS.map((item) => item.id))

export function normalizeHotspotStyle(hotspot = {}) {
  const style = hotspot.style || {}
  const preset = HOTSPOT_PRESET_IDS.has(style.preset) ? style.preset : 'navigation'
  const definition = HOTSPOT_PRESETS.find((item) => item.id === preset) || HOTSPOT_PRESETS[0]

  return {
    preset,
    color: typeof style.color === 'string' && style.color ? style.color : definition.defaultColor,
    opacity: Number.isFinite(Number(style.opacity)) ? Math.min(1, Math.max(0.2, Number(style.opacity))) : 0.92,
  }
}
