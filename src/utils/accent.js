export function darkenHex(hex, pct = 20) {
  const c = hex.slice(1)
  const f = 1 - pct / 100
  const channel = s => Math.min(255, Math.max(0, Math.round(parseInt(s, 16) * f)))
  return '#' + [c.slice(0, 2), c.slice(2, 4), c.slice(4, 6)].map(channel).map(x => x.toString(16).padStart(2, '0')).join('')
}

// Relative luminance per WCAG. Returns 0..1.
function luminance(r, g, b) {
  const lin = c => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// Pick black or white text for maximum contrast against the given background color.
export function contrastColor(hex) {
  const c = hex.slice(1)
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return luminance(r, g, b) > 0.179 ? '#000' : '#fff'
}

export function applyAccentColor(color) {
  document.documentElement.style.setProperty('--ui-accent', color)
  document.documentElement.style.setProperty('--ui-accent-hover', darkenHex(color))
  document.documentElement.style.setProperty('--ui-on-accent', contrastColor(color))
}
