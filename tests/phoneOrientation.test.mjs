import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createPhoneOrientation, requestPhoneMotionPermission } from '../src/input/phoneOrientation.js'

function phone() {
  const source = new EventTarget()
  source.isSecureContext = true
  source.DeviceOrientationEvent = {}
  source.screen = { orientation: Object.assign(new EventTarget(), { angle: 0 }) }
  source.setInterval = (callback) => { source.watchdog = callback; return 1 }
  source.clearInterval = () => { source.watchdog = null }
  source.pose = (alpha, beta = 90, gamma = 0, type = 'deviceorientation') => {
    const event = Object.assign(new Event(type), { alpha, beta, gamma })
    source.dispatchEvent(event)
  }
  return source
}

test('selecting gyroscope requests the browser permission immediately and also works without a permission API', async () => {
  const source = phone()
  let requested = false
  source.DeviceOrientationEvent.requestPermission = () => { requested = true; return Promise.resolve('granted') }
  const pending = requestPhoneMotionPermission(source)
  assert.equal(requested, true)
  assert.equal((await pending).granted, true)
  delete source.DeviceOrientationEvent.requestPermission
  assert.equal((await requestPhoneMotionPermission(source)).granted, true)
  source.isSecureContext = false
  assert.equal((await requestPhoneMotionPermission(source)).code, 'insecure')
})

test('motion updates the camera immediately, stops in Drag, and starts again without a display switch', () => {
  const source = phone(), camera = new THREE.PerspectiveCamera()
  const tracker = createPhoneOrientation({ camera, source })
  tracker.start('granted')
  source.pose(0); tracker.update()
  assert.equal(tracker.getStatus().status, 'active')
  const initial = camera.quaternion.clone()
  source.pose(45); tracker.update()
  assert.ok(camera.quaternion.angleTo(initial) > .7)
  tracker.stop()
  const dragged = camera.quaternion.clone()
  source.pose(100); tracker.update()
  assert.ok(camera.quaternion.equals(dragged))
  tracker.start('granted')
  source.pose(100); tracker.update()
  assert.ok(camera.quaternion.angleTo(dragged) < .00001, 'preserve viewing direction on re-entry')
  source.pose(140); tracker.update()
  assert.ok(camera.quaternion.angleTo(dragged) > .6)
  tracker.stop()
})

test('zero-valued and absolute sensor events work; stale sensors and denied permission never claim active motion', () => {
  const source = phone(), camera = new THREE.PerspectiveCamera()
  let now = 0
  const tracker = createPhoneOrientation({ camera, source, now: () => now })
  tracker.start('granted')
  source.pose(null, null, null)
  assert.equal(tracker.getStatus().status, 'waiting')
  source.pose(0, 0, 0, 'deviceorientationabsolute'); tracker.update()
  assert.equal(tracker.getStatus().status, 'active')
  now = 4000; source.watchdog()
  assert.equal(tracker.getStatus().status, 'waiting')
  tracker.start('denied'); source.pose(50)
  assert.equal(tracker.getStatus().status, 'denied')
  tracker.stop()
})
