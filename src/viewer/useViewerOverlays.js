import { useCallback, useEffect, useRef } from 'react'
import { createOverlayVisibility, isEmptyTouchTap, nearOverlayEdge } from './overlayVisibility'

export function useViewerOverlays({ enabled, busy, revealKey }) {
  const root = useRef(null), controller = useRef(null), state = useRef({ busy, enabled })
  state.current = { busy, enabled }
  const tap = useRef({}), pointers = useRef(new Set())
  const input = useRef('mouse')
  useEffect(() => {
    const surface = root.current
    if (!surface) return undefined
    const setVisible = (visible) => {
      surface.dataset.overlays = visible ? 'visible' : 'hidden'
      surface.querySelectorAll('[data-viewer-chrome]').forEach((node) => { node.inert = !visible })
    }
    const isLocked = () => state.current.busy || Boolean(
      surface.querySelector('details[open], [aria-expanded="true"], [aria-busy="true"], [aria-modal="true"]')
      || (input.current === 'keyboard' && document.activeElement?.closest('[data-viewer-chrome]') && surface.contains(document.activeElement))
      || (input.current === 'mouse' && surface.querySelector('[data-viewer-chrome]:hover')))
    const controls = createOverlayVisibility({ onChange: setVisible, isLocked })
    controller.current = controls
    controls.setEnabled(state.current.enabled)
    const down = (event) => {
      input.current = event.pointerType || 'mouse'
      if (event.pointerType !== 'touch') { controls.activity(); return }
      if (!pointers.current.size) tap.current = { touch: true, moved: false, cancelled: false, multiple: false, x: event.clientX, y: event.clientY, startedOnCanvas: event.target.tagName === 'CANVAS' }
      pointers.current.add(event.pointerId)
      if (pointers.current.size > 1) tap.current.multiple = true
    }
    const move = (event) => {
      if (event.pointerType === 'touch') {
        if (Math.hypot(event.clientX - tap.current.x, event.clientY - tap.current.y) > 8) tap.current.moved = true
        return
      }
      input.current = 'mouse'
      const rect = surface.getBoundingClientRect()
      if (nearOverlayEdge(event.clientY, rect.top, rect.height)) controls.show()
      else controls.activity()
    }
    const up = (event) => {
      if (event.type === 'pointercancel') tap.current.cancelled = true
      if (event.pointerType === 'touch' && Math.hypot(event.clientX - tap.current.x, event.clientY - tap.current.y) > 8) tap.current.moved = true
      pointers.current.delete(event.pointerId)
    }
    const key = (event) => {
      if (!surface.contains(document.activeElement) && document.activeElement !== document.body) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      input.current = 'keyboard'; controls.show()
    }
    const focus = () => controls.show()
    const mutation = new MutationObserver(() => { if (isLocked()) controls.show(); else controls.activity() })
    mutation.observe(surface, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'aria-expanded', 'aria-busy'] })
    surface.addEventListener('pointerdown', down, true)
    surface.addEventListener('pointermove', move, true)
    surface.addEventListener('pointerup', up, true)
    surface.addEventListener('pointercancel', up, true)
    surface.addEventListener('focusin', focus)
    document.addEventListener('keydown', key, true)
    return () => {
      controls.dispose(); controller.current = null; mutation.disconnect()
      surface.removeEventListener('pointerdown', down, true)
      surface.removeEventListener('pointermove', move, true)
      surface.removeEventListener('pointerup', up, true)
      surface.removeEventListener('pointercancel', up, true)
      surface.removeEventListener('focusin', focus)
      document.removeEventListener('keydown', key, true)
    }
  }, [])
  useEffect(() => { controller.current?.setEnabled(enabled) }, [enabled])
  useEffect(() => { controller.current?.show() }, [busy, revealKey])
  const onPointerMissed = useCallback((event) => {
    if (!state.current.enabled || state.current.busy) return
    if (!isEmptyTouchTap(tap.current, event.target?.tagName === 'CANVAS')) return
    tap.current.cancelled = true
    const surface = root.current
    if (surface.querySelector('[aria-busy="true"], [aria-modal="true"]')) return
    surface.querySelectorAll('details[open]').forEach((node) => { node.open = false })
    controller.current?.toggle()
  }, [])
  return { root, onPointerMissed }
}
