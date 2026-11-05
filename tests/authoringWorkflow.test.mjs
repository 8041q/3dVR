import test from 'node:test'
import assert from 'node:assert/strict'
import { openingViewPatch } from '../src/product/authoringWorkflow.js'

test('leaving camera setup unchanged does not dirty a legacy product', () => {
  assert.equal(openingViewPatch({ rotationY: 0, viewer: { exposure: 1 } }, { rotationY: 360, startPitch: 0, startZoom: 1 }), null)
})

test('continuing captures the chosen angle and zoom without losing other settings', () => {
  const action = { rotationY: 0, viewer: { upAxis: 'z', orbitMode: 'free', exposure: 1.4, autoRotate: true } }
  const patch = openingViewPatch(action, { rotationY: 685, startPitch: 18.44, startZoom: 1.247 })
  assert.equal(patch.rotationY, -35)
  assert.deepEqual(patch.viewer, { ...action.viewer, startPitch: 18.4, startZoom: 1.25 })
  assert.equal(action.rotationY, 0)
})

test('an unready or invalid camera cannot replace the saved opening view', () => {
  for (const view of [null, {}, { rotationY: NaN, startPitch: 0, startZoom: 1 }]) assert.equal(openingViewPatch({}, view), null)
})
