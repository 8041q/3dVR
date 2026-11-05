import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera } from 'three'
import { createXRSessionController } from '../src/viewer/xrSession.js'
import { watchXRCapabilities } from '../src/viewer/xrCapabilities.js'
import { resetPhoneViewProfile, PHONE_VIEW_MODES } from '../src/phoneViewProfile.js'

const flush = () => new Promise((resolve) => setImmediate(resolve))
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function setup({ request, bind } = {}) {
  const camera = new PerspectiveCamera(75, 2, .01, 200)
  camera.position.set(0, 0, .01)
  const xrRenderer = new EventTarget()
  xrRenderer.setReferenceSpaceType = (space) => { xrRenderer.space = space }
  xrRenderer.setSession = bind || (async () => { camera.fov = 110; camera.position.y = 1.7 })
  const events = { modes: [], pending: [], errors: [], tracking: [] }
  let calls = 0
  function session() {
    const value = new EventTarget()
    value.ended = 0
    value.requestReferenceSpace = async () => ({})
    value.end = async () => { ++value.ended; value.dispatchEvent(new Event('end')); xrRenderer.dispatchEvent(new Event('sessionend')) }
    return value
  }
  const device = session()
  const xr = { requestSession: () => { ++calls; return request ? request() : Promise.resolve(device) } }
  const controller = createXRSessionController({ onMode: (v) => events.modes.push(v), onPending: (v) => events.pending.push(v), onError: (v) => events.errors.push(v), onTracking: (v) => events.tracking.push(v) })
  return { camera, renderer: { xr: xrRenderer }, xr, controller, events, device, session, calls: () => calls }
}

test('headset entry supplies runtime camera and normal exit restores non-XR camera', async () => {
  const s = setup()
  await s.controller.start(s.xr, s.renderer, s.camera)
  assert.deepEqual(s.events.modes, ['vr'])
  assert.equal(s.camera.fov, 110)
  await s.device.end(); await flush()
  assert.deepEqual(s.events.modes, ['vr', 'pc'])
  assert.equal(s.camera.fov, 75)
  assert.equal(s.camera.position.y, 0)
})

for (const mode of ['pc', 'phone']) test(`late headset entry cannot override ${mode}`, async () => {
  const result = deferred(), s = setup({ request: () => result.promise })
  const entry = s.controller.start(s.xr, s.renderer, s.camera)
  await s.controller.start(s.xr, s.renderer, s.camera)
  assert.equal(s.calls(), 1)
  await s.controller.select(mode)
  result.resolve(s.device); await entry
  assert.deepEqual(s.events.modes, [mode])
  assert.equal(s.device.ended, 1)
  assert.deepEqual(s.events.pending, [true, false])
})

test('cancel during renderer attachment waits for teardown and restores camera', async () => {
  const binding = deferred(), s = setup({ bind: () => binding.promise })
  const entry = s.controller.start(s.xr, s.renderer, s.camera)
  await flush()
  const selection = s.controller.select('phone')
  s.camera.position.y = 2; s.camera.fov = 100
  binding.resolve(); await Promise.all([entry, selection]); await flush()
  assert.equal(s.events.modes.at(-1), 'phone')
  assert.equal(s.events.modes.includes('vr'), false)
  assert.equal(s.camera.position.y, 0)
})

test('old session events cannot end a newer session', async () => {
  const s = setup()
  await s.controller.start(s.xr, s.renderer, s.camera)
  await s.controller.select('phone')
  const next = s.session()
  await s.controller.start({ requestSession: async () => next }, s.renderer, s.camera)
  s.device.dispatchEvent(new Event('end')); await flush()
  assert.equal(s.events.modes.at(-1), 'vr')
  await next.end(); await flush()
  assert.equal(s.events.modes.at(-1), 'pc')
})

test('entry rejection recovers and reference space falls back to local', async () => {
  const s = setup({ request: () => Promise.reject(new Error('busy')) })
  await s.controller.start(s.xr, s.renderer, s.camera)
  assert.equal(s.events.errors[0].message, 'busy')
  s.device.requestReferenceSpace = async () => { throw new Error('no floor') }
  await s.controller.start({ requestSession: async () => s.device }, s.renderer, s.camera)
  assert.equal(s.renderer.xr.space, 'local')
  s.controller.dispose(); await flush()
})

test('calibration reset preserves layout and single view optical settings', () => {
  const single = resetPhoneViewProfile({ mode: PHONE_VIEW_MODES.MAGIC_WINDOW, fovDeg: 95, ipdMm: 68, centerGapPx: 12 })
  assert.equal(single.mode, PHONE_VIEW_MODES.MAGIC_WINDOW)
  assert.equal(single.fovDeg, 75)
  assert.equal(single.ipdMm, 68)
  assert.equal(single.centerGapPx, 12)
  const split = resetPhoneViewProfile({ ...single, mode: PHONE_VIEW_MODES.HEADSET_STEREO })
  assert.equal(split.mode, PHONE_VIEW_MODES.HEADSET_STEREO)
  assert.equal(split.ipdMm, 64)
})

test('renderer attachment failure ends the session and restores the camera', async () => {
  const s = setup({ bind: async () => { s.camera.fov = 105; throw new Error('attachment failed') } })
  await s.controller.start(s.xr, s.renderer, s.camera)
  await flush()
  assert.equal(s.device.ended, 1)
  assert.equal(s.camera.fov, 75)
  assert.equal(s.events.errors[0].message, 'attachment failed')
  assert.equal(s.events.modes.at(-1), 'pc')
})

test('availability refresh, out-of-order results, and listener cleanup', async () => {
  const source = new EventTarget(), xr = new EventTarget(), document = new EventTarget()
  document.visibilityState = 'visible'
  const requests = []
  xr.isSessionSupported = () => { const result = deferred(); requests.push(result); return result.promise }
  Object.assign(source, { isSecureContext: true, navigator: { xr }, document })
  const states = [], stop = watchXRCapabilities(source, (state) => states.push(state))
  xr.dispatchEvent(new Event('devicechange'))
  requests[1].resolve(true); await flush()
  requests[0].resolve(false); await flush()
  assert.equal(states.at(-1).immersiveVRSupported, true)
  source.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(requests.length, 4)
  stop()
  const count = states.length
  requests[3].resolve(false); await flush()
  xr.dispatchEvent(new Event('devicechange')); source.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(states.length, count)
  assert.equal(requests.length, 4)
})

test('availability explains insecure, unsupported, absent and failed runtime', async () => {
  for (const [secure, xr, expected] of [
    [false, {}, /HTTPS/], [true, {}, /browser/],
    [true, { isSessionSupported: async () => false }, /No supported/],
    [true, { isSessionSupported: async () => { throw new Error('blocked') } }, /blocked/],
  ]) {
    const source = new EventTarget()
    Object.assign(source, { isSecureContext: secure, navigator: { xr }, document: new EventTarget() })
    let state
    const stop = watchXRCapabilities(source, (next) => { state = next })
    await flush(); stop()
    assert.equal(state.immersiveVRChecking, false)
    assert.equal(state.immersiveVRSupported, false)
    assert.match(state.immersiveVRReason, expected)
  }
})
