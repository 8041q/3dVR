import assert from 'node:assert/strict'
import test from 'node:test'
import { createOverlayVisibility, nearOverlayEdge, isEmptyTouchTap } from '../src/viewer/overlayVisibility.js'

function clock() {
  let time = 0, nextId = 0
  const timers = new Map()
  return {
    schedule(callback, delay) { const id = ++nextId; timers.set(id, { callback, at: time + delay }); return id },
    cancel(id) { timers.delete(id) },
    advance(ms) { const end = time + ms; while (true) { const next = [...timers].sort((a,b) => a[1].at-b[1].at)[0]; if (!next || next[1].at > end) break; time = next[1].at; timers.delete(next[0]); next[1].callback() }; time = end },
    get size() { return timers.size },
  }
}

test('tour overlays hide after five seconds and activity resets the full timeout', () => {
  const timer = clock(), changes = []
  const controls = createOverlayVisibility({ ...timer, onChange: (shown) => changes.push(shown) })
  controls.show(); timer.advance(4999)
  assert.equal(controls.visible, true)
  controls.activity(); timer.advance(4999)
  assert.equal(controls.visible, true)
  timer.advance(1); assert.equal(controls.visible, false)
  controls.activity(); assert.equal(controls.visible, false, 'moving in the scene should not reveal hidden controls')
  controls.show(); assert.equal(controls.visible, true)
  controls.dispose(); assert.equal(timer.size, 0)
  assert.deepEqual(changes, [true, false, true])
})

test('open menus and busy dialogs keep controls available; immersive sessions never time out', () => {
  const timer = clock(); let locked = true
  const controls = createOverlayVisibility({ ...timer, isLocked: () => locked, onChange() {} })
  controls.show(); timer.advance(15000); assert.equal(controls.visible, true)
  locked = false; controls.activity(); timer.advance(5000); assert.equal(controls.visible, false)
  controls.setEnabled(false); timer.advance(60000); assert.equal(controls.visible, true)
  controls.toggle(); assert.equal(controls.visible, true)
  controls.dispose()
})

test('empty phone taps toggle controls while swipes, pinches, cancelled gestures and hotspot taps do not', () => {
  const tap = { touch: true, startedOnCanvas: true }
  assert.equal(isEmptyTouchTap(tap, true), true)
  for (const patch of [{ moved: true }, { multiple: true }, { cancelled: true }, { touch: false }, { startedOnCanvas: false }]) {
    assert.equal(isEmptyTouchTap({ ...tap, ...patch }, true), false)
  }
  assert.equal(isEmptyTouchTap(tap, false), false)
  const timer = clock(), controls = createOverlayVisibility({ ...timer, onChange() {} })
  controls.toggle(); assert.equal(controls.visible, false)
  controls.toggle(); assert.equal(controls.visible, true)
  timer.advance(5000); assert.equal(controls.visible, false)
  controls.dispose()
})

test('mouse recall zones use the viewer edges, including embedded draft previews', () => {
  assert.equal(nearOverlayEdge(60, 50, 600), true)
  assert.equal(nearOverlayEdge(640, 50, 600), true)
  assert.equal(nearOverlayEdge(350, 50, 600), false)
  assert.equal(nearOverlayEdge(40, 50, 600), false)
})
