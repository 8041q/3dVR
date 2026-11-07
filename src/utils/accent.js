export function darkenHex(hex, pct = 20) {
  const c = hex.slice(1)
  const f = 1 - pct / 100
  const channel = s => Math.min(255, Math.max(0, Math.round(parseInt(s, 16) * f)))
  return '#' + [c.slice(0, 2), c.slice(2, 4), c.slice(4, 6)].map(channel).map(x => x.toString(16).padStart(2, '0')).join('')
}

export function applyAccentColor(color) {
  document.documentElement.style.setProperty('--ui-accent', color)
  document.documentElement.style.setProperty('--ui-accent-hover', darkenHex(color))
}
