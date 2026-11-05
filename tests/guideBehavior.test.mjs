import assert from 'node:assert/strict'
import test from 'node:test'
import { createGuideStep } from '../src/guides/guideSchema.js'
import {
  guideAdvanceDelay,
  guideAdvanceHotspot,
  guideEntryAction,
  guideProductTarget,
  guideStepTargetIssues,
} from '../src/guides/guidePlayback.js'
import { removeProjectHotspot } from '../src/editor/projectEdits.js'

const info = { id: 'info', type: 'show-info', body: 'About this room' }
const product = {
  id: 'bed',
  type: 'inspect-model',
  modelUrl: '/uploads/bed.glb',
  animationControls: [{ clip: 'Open' }],
  materialVariants: [{ id: 'oak' }],
}
const startGuide = { id: 'start', type: 'start-guide', guideId: 'guide' }
const scene = {
  id: 'showroom',
  hotspots: [
    { id: 'combined', actions: [startGuide, info, product] },
    { id: 'loop', actions: [startGuide] },
  ],
}

test('guide entry runs one safe action in the selected scene', () => {
  const step = { sceneId: scene.id, autoActivateHotspotId: 'combined', autoActivateActionId: 'info' }
  assert.equal(guideEntryAction(step, scene), info)
  assert.equal(guideEntryAction({ ...step, autoActivateActionId: 'start' }, scene), null)
  assert.equal(guideEntryAction({ ...step, autoActivateActionId: '' }, scene), null)
  assert.equal(guideEntryAction({ ...step, sceneId: '' }, scene), null)
  assert.equal(guideEntryAction(step, { ...scene, id: 'lobby' }), null)

  const loop = { sceneId: scene.id, autoActivateHotspotId: 'loop' }
  assert.equal(guideEntryAction(loop, scene), null)
  assert.equal(guideStepTargetIssues(loop, scene)[0].severity, 'warning')
})

test('guide product commands bind to the exact opened product or the legacy highlighted product', () => {
  const step = {
    sceneId: scene.id,
    autoActivateHotspotId: 'combined',
    autoActivateActionId: 'bed',
    inspectionCommand: { animationClip: 'Open', variantId: 'oak' },
  }
  assert.deepEqual(guideProductTarget(step, scene), { hotspotId: 'combined', action: product, autoOpen: true })
  assert.deepEqual(guideStepTargetIssues(step, scene), [])
  assert.equal(guideProductTarget({ ...step, autoActivateActionId: 'info', highlightHotspotId: 'combined' }, scene), null)
  assert.equal(guideStepTargetIssues({ ...step, inspectionCommand: { variantId: 'missing' } }, scene)[0].severity, 'error')
  assert.deepEqual(guideProductTarget({ sceneId: scene.id, highlightHotspotId: 'combined' }, scene),
    { hotspotId: 'combined', action: product, autoOpen: false })
})

test('new steps default to Next and explicit advance modes ignore the other trigger', () => {
  assert.equal(createGuideStep(scene.id).advanceMode, 'manual')
  const previous = { sceneId: scene.id, advanceOnHotspotId: 'combined', autoAdvanceMs: 3000 }
  assert.equal(guideAdvanceDelay(previous), 3000)
  assert.equal(guideAdvanceHotspot(previous), 'combined')
  assert.equal(guideAdvanceDelay({ ...previous, advanceMode: 'hotspot' }), 0)
  assert.equal(guideAdvanceHotspot({ ...previous, advanceMode: 'timer' }), '')
  assert.equal(guideStepTargetIssues({ ...previous, advanceMode: 'timer', autoAdvanceMs: 0 }, scene)[0].field, 'autoAdvanceMs')
})

test('a step can continue on either a hotspot selection or a timer', () => {
  const step = { ...createGuideStep(scene.id), advanceMode: 'hotspot-or-timer', advanceOnHotspotId: 'combined', autoAdvanceMs: 4500 }
  assert.equal(guideAdvanceHotspot(step), 'combined')
  assert.equal(guideAdvanceDelay(step), 4500)
  assert.deepEqual(guideStepTargetIssues(step, scene), [])
  assert.equal(guideStepTargetIssues({ ...step, advanceOnHotspotId: '' }, scene)[0].field, 'advanceOnHotspotId')
  assert.equal(guideStepTargetIssues({ ...step, autoAdvanceMs: 0 }, scene)[0].field, 'autoAdvanceMs')
  const project = { scenes: [scene], guides: [{ id: 'guide', steps: [step] }] }
  const cleaned = removeProjectHotspot(project, scene.id, 'combined').guides[0].steps[0]
  assert.equal(cleaned.advanceMode, 'timer')
  assert.equal(guideAdvanceDelay(cleaned), 4500)
})

test('deleting a guide target clears its dependent fields and keeps the old snapshot intact', () => {
  const step = {
    ...createGuideStep(scene.id),
    advanceMode: 'hotspot',
    advanceOnHotspotId: 'combined',
    autoActivateHotspotId: 'combined',
    autoActivateActionId: 'bed',
    inspectionCommand: { animationClip: 'Open', variantId: 'oak' },
  }
  const project = { scenes: [scene], guides: [{ id: 'guide', steps: [step] }] }
  const next = removeProjectHotspot(project, scene.id, 'combined').guides[0].steps[0]
  assert.deepEqual(next, {
    ...step,
    advanceMode: 'manual',
    advanceOnHotspotId: '',
    autoActivateHotspotId: '',
    autoActivateActionId: '',
    inspectionCommand: { animationClip: '', variantId: '' },
  })
  assert.equal(project.guides[0].steps[0].autoActivateActionId, 'bed')
})
