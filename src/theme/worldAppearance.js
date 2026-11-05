let palette

export function worldAppearance() {
  if (palette) return palette
  const styles = getComputedStyle(document.documentElement)
  const tokens = [
    'surface', 'ink', 'muted', 'subtle', 'line', 'border', 'accent', 'on-accent', 'selected',
    'danger', 'danger-surface', 'font', 'mono', 'marker-outline', 'marker-selected', 'marker-guide',
  ]
  palette = Object.fromEntries(tokens.map((token) => [token, styles.getPropertyValue(`--ui-${token}`).trim()]))
  return palette
}

export function drawWorldSurface(context, { fill, stroke, radius, border = 4 }) {
  const { width, height } = context.canvas
  context.clearRect(0, 0, width, height)
  context.fillStyle = fill
  context.strokeStyle = stroke
  context.lineWidth = border
  context.beginPath()
  context.roundRect(border, border, width - border * 2, height - border * 2, radius)
  context.fill()
  context.stroke()
}
