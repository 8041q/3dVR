export const OVERLAY_IDLE_MS = 5000

export function createOverlayVisibility({ onChange, isLocked = () => false, schedule = setTimeout, cancel = clearTimeout, delay = OVERLAY_IDLE_MS }) {
  let visible = true, enabled = true, timer = null
  const clear = () => { if (timer !== null) cancel(timer); timer = null }
  const arm = () => {
    clear()
    if (!enabled || !visible) return
    timer = schedule(() => {
      timer = null
      if (isLocked()) arm()
      else { visible = false; onChange(false) }
    }, delay)
  }
  return {
    setEnabled(value) { enabled = value; this.show() },
    show() { visible = true; onChange(true); arm() },
    activity() { if (visible) arm() },
    toggle() { if (!enabled || isLocked()) { this.show(); return }; visible = !visible; onChange(visible); arm() },
    get visible() { return visible },
    dispose: clear,
  }
}

export function nearOverlayEdge(y, top, height, band = 96) {
  return y >= top && y <= top + height && (y - top <= band || top + height - y <= band)
}

export function isEmptyTouchTap({ touch, moved, multiple, cancelled, startedOnCanvas }, targetIsCanvas) {
  return Boolean(touch && !moved && !multiple && !cancelled && startedOnCanvas && targetIsCanvas)
}
