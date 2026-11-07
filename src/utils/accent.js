const STORAGE_KEY = 'atria:accent'

// Accepts #rgb or #rrggbb (the # is optional) and returns '#rrggbb', or null
// when the value is not a usable colour. Everything below goes through this,
// so a bad value from settings can never leave the UI half-themed.
export function normalizeHex(value) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  const digits = match[1].toLowerCase()
  return '#' + (digits.length === 3 ? [...digits].map(c => c + c).join('') : digits)
}

export function darkenHex(hex, pct = 20) {
  const c = (normalizeHex(hex) || hex).slice(1)
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
  const normal = normalizeHex(hex)
  if (!normal) return '#fff'
  const c = normal.slice(1)
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return luminance(r, g, b) > 0.179 ? '#000' : '#fff'
}

// Applies the accent to the page. Returns false (and changes nothing) for an
// invalid colour. Pass { remember: true } only for a colour that comes from
// saved settings, so live previews in the settings page are never stored.
export function applyAccentColor(color, { remember = false } = {}) {
  const hex = normalizeHex(color)
  if (!hex) return false
  const style = document.documentElement.style
  style.setProperty('--ui-accent', hex)
  style.setProperty('--ui-accent-hover', darkenHex(hex))
  style.setProperty('--ui-on-accent', contrastColor(hex))
  if (remember) {
    try { localStorage.setItem(STORAGE_KEY, hex) } catch { /* private mode: skip */ }
  }
  return true
}

// Re-applies the last saved accent before the first paint, so a tour does not
// open in the default blue and then flash to the host's colour (and so it also
// works offline, when no request can be made).
export function applyStoredAccent() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) applyAccentColor(stored)
  } catch { /* storage unavailable: keep default */ }
}