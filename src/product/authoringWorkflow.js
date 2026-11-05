const angle = (value = 0) => ((Number(value) % 360) + 540) % 360 - 180

export function openingViewPatch(action, view) {
  if (!view || ![view.rotationY, view.startPitch, view.startZoom].every(Number.isFinite)) return null
  const rotationY = Number(angle(view.rotationY).toFixed(1))
  const startPitch = Number(Math.max(-89, Math.min(89, view.startPitch)).toFixed(1))
  const startZoom = Number(Math.max(0.1, view.startZoom).toFixed(2))
  if (Math.abs(angle(action.rotationY || 0) - rotationY) < 0.05
    && Math.abs((action.viewer?.startPitch || 0) - startPitch) < 0.05
    && Math.abs((action.viewer?.startZoom || 1) - startZoom) < 0.005) return null
  return { rotationY, viewer: { ...action.viewer, startPitch, startZoom } }
}
