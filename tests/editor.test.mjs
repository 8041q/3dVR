import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clamp, damp, nearestAngle, PITCH_LIMIT, pointerSensitivity, wheelPixels } from '../src/input/lookMotion.js'
import { projectChecks } from '../src/editor/projectChecks.js'
import { removeProjectScene, removeProjectHotspot, replaceSpatialRoom } from '../src/editor/projectEdits.js'
import { contentSignature, mergeSavedDraft } from '../src/editor/draftState.js'

const info = { id: 'info', type: 'show-info', title: 'Hello', body: 'Welcome' }
const navigate = { id: 'navigate', type: 'navigate-scene', sceneId: 'b' }
const project = () => ({
  title: 'Tour', startSceneId: 'b',
  scenes: [
    { id: 'a', title: 'Room A', image: '/a.jpg', hotspots: [
      { id: 'mixed', actions: [info, navigate], targetSceneId: 'b' },
      { id: 'legacy', targetSceneId: 'b' },
    ] },
    { id: 'b', title: 'Room B', panorama: { manifestUrl: '/tiles.json' }, hotspots: [] },
  ],
  guides: [{ id: 'tour', title: 'Tour', steps: [
    { id: 's1', sceneId: 'a', highlightHotspotId: 'legacy', advanceOnHotspotId: 'legacy', autoActivateHotspotId: 'legacy' },
    { id: 's2', sceneId: 'b' },
  ] }],
})

test('detaching a tracked room preserves panorama actions and clears removed guide targets', () => {
  const draft = project()
  const room = { id: 'room', type: 'play-room-animation', clip: 'Open' }
  draft.scenes[0].spatial = { roomUrl: '/room.glb' }
  draft.scenes[0].hotspots.push({ id: 'room-only', spatialPosition: [0, 1, 0], actions: [room] })
  draft.scenes[0].hotspots.push({ id: 'fallback', spatialPosition: [0, 2, 0], actions: [room, info] })
  draft.guides[0].steps[0].highlightHotspotId = 'room-only'
  const next = replaceSpatialRoom(draft, 'a', { spatial: null })
  assert.equal(next.scenes[0].spatial, null)
  assert.equal(next.scenes[0].hotspots.some((hotspot) => hotspot.id === 'room-only'), false)
  const kept = next.scenes[0].hotspots.find((hotspot) => hotspot.id === 'fallback')
  assert.deepEqual(kept.actions, [info])
  assert.equal(kept.spatialPosition, undefined)
  assert.equal(next.guides[0].steps[0].highlightHotspotId, '')
  assert.equal(draft.scenes[0].spatial.roomUrl, '/room.glb')
})

test('look damping has the same response across frame rates', () => {
  const simulate = (fps) => {
    let angle = 0
    for (let i = 0; i < fps / 5; i++) angle = damp(angle, 1, 1 / fps)
    return angle
  }
  assert.ok(Math.abs(simulate(30) - simulate(60)) < 1e-10)
  assert.ok(Math.abs(simulate(60) - simulate(120)) < 1e-10)
  assert.ok(simulate(60) > 0.95)
})

test('look motion never overshoots and settles exactly', () => {
  let angle = 0
  for (let i = 0; i < 200; i++) {
    angle = damp(angle, -2, 1 / 60)
    assert.ok(angle >= -2 && angle <= 0)
  }
  assert.equal(angle, -2)
  assert.equal(damp(0, 1, 5), damp(0, 1, 0.1))
  assert.equal(damp(0, 1, -1), 0)
})

test('camera focus takes the short route across the yaw seam', () => {
  const radians = (degrees) => degrees * Math.PI / 180
  assert.ok(Math.abs(nearestAngle(radians(179), radians(-179)) - radians(181)) < 1e-10)
  assert.ok(Math.abs(nearestAngle(radians(720), radians(10)) - radians(730)) < 1e-10)
})

test('camera focus faces the actual hotspot position', () => {
  for (const yaw of [-179, -90, 0, 45, 179]) {
    const pitch = 25 * Math.PI / 180
    const angle = yaw * Math.PI / 180
    const camera = new THREE.PerspectiveCamera()
    camera.rotation.set(pitch, -angle, 0, 'YXZ')
    const forward = camera.getWorldDirection(new THREE.Vector3())
    const hotspot = new THREE.Vector3(Math.cos(pitch) * Math.sin(angle), Math.sin(pitch), -Math.cos(pitch) * Math.cos(angle))
    assert.ok(forward.distanceTo(hotspot) < 1e-10)
  }
})

test('drag sensitivity scales with viewport and zoom; pitch avoids pole flips', () => {
  assert.equal(pointerSensitivity(75, 1200) * 2, pointerSensitivity(75, 600))
  assert.ok(pointerSensitivity(35, 600) < pointerSensitivity(75, 600))
  assert.equal(clamp(10, -PITCH_LIMIT, PITCH_LIMIT), PITCH_LIMIT)
  assert.equal(clamp(-10, -PITCH_LIMIT, PITCH_LIMIT), -PITCH_LIMIT)
})

test('wheel handling normalizes line/page deltas and bounds trackpad spikes', () => {
  assert.equal(wheelPixels({ deltaY: 2, deltaMode: 1 }, 800), 32)
  assert.equal(wheelPixels({ deltaY: 16, deltaMode: 0 }, 800), 16)
  assert.equal(wheelPixels({ deltaY: 1, deltaMode: 2 }, 800), 240)
  assert.equal(wheelPixels({ deltaY: -10000, deltaMode: 0 }, 800), -240)
})

test('complete projects include legacy navigation and tiled panoramas', () => {
  assert.deepEqual(projectChecks(project()), [])
})

test('missing panoramas and starting scenes lead back to Scenes', () => {
  const draft = project()
  draft.startSceneId = 'missing'
  draft.scenes[0].image = ''
  const issues = projectChecks(draft)
  assert.equal(issues.length, 2)
  assert.ok(issues.every((issue) => issue.tool === 'scene'))
  assert.equal(issues[1].sceneId, 'a')
})

test('unconfigured actions produce actionable links to their hotspot', () => {
  const draft = project()
  draft.scenes[0].hotspots = [{ id: 'broken', actions: [
    { type: 'navigate-scene', sceneId: 'missing' },
    { type: 'inspect-model', modelUrl: '' },
    { type: 'show-info', body: '   ' },
    { type: 'open-url', url: 'javascript:alert(1)' },
    { type: 'start-guide', guideId: 'missing' },
    { type: 'play-room-animation', clip: 'Open' },
    { type: 'unknown' },
  ] }]
  draft.guides = []
  const issues = projectChecks(draft)
  assert.equal(issues.length, 7)
  assert.ok(issues.every((issue) => issue.tool === 'hotspots' && issue.sceneId === 'a' && issue.hotspotId === 'broken'))
})

test('inert hotspots block release while unreferenced empty guides only warn', () => {
  const draft = project()
  draft.scenes[1].hotspots.push({ id: 'empty', actions: [] })
  draft.guides.push({ id: 'empty', title: 'Empty tour', steps: [] })
  assert.equal(projectChecks(draft).length, 1)
  assert.ok(projectChecks(draft, { includeWarnings: true }).some((issue) =>
    issue.guideId === 'empty' && issue.severity === 'warning'))
})

test('broken tour scenes and hotspot references are reported', () => {
  const draft = project()
  draft.guides[0].steps[0].highlightHotspotId = 'missing'
  draft.guides[0].steps[1].sceneId = 'missing'
  assert.equal(projectChecks(draft).length, 2)
})

test('room animation checks respect available clips', () => {
  const draft = project()
  draft.scenes[1].spatial = { roomUrl: '/room.glb', animations: ['Open'] }
  draft.scenes[1].hotspots.push({ id: 'room', actions: [{ type: 'play-room-animation', clip: 'Open' }] })
  assert.deepEqual(projectChecks(draft), [])
  draft.scenes[1].hotspots[0].actions[0].clip = 'Missing'
  assert.equal(projectChecks(draft).length, 1)
})

test('scene removal preserves unrelated actions and repairs all references atomically', () => {
  const original = project()
  const before = JSON.stringify(original)
  const next = removeProjectScene(original, 'b')
  assert.equal(next.scenes.length, 1)
  assert.equal(next.startSceneId, 'a')
  assert.deepEqual(next.scenes[0].hotspots, [{ id: 'mixed', actions: [info], targetSceneId: '' }])
  assert.equal(next.guides[0].steps.length, 1)
  for (const field of ['highlightHotspotId', 'advanceOnHotspotId', 'autoActivateHotspotId']) assert.equal(next.guides[0].steps[0][field], '')
  assert.equal(JSON.stringify(original), before)
  assert.deepEqual(projectChecks(next), [])
})

test('the final scene cannot be removed', () => {
  const draft = removeProjectScene(project(), 'b')
  assert.equal(removeProjectScene(draft, 'a'), draft)
})

test('hotspot deletion repairs tour triggers without mutating the undo snapshot', () => {
  const original = project()
  const next = removeProjectHotspot(original, 'a', 'legacy')
  assert.equal(next.scenes[0].hotspots.length, 1)
  assert.equal(original.scenes[0].hotspots.length, 2)
  assert.equal(next.guides[0].steps[0].advanceOnHotspotId, '')
  assert.equal(original.guides[0].steps[0].advanceOnHotspotId, 'legacy')
  assert.deepEqual(projectChecks(next), [])
})

test('edits made while saving survive the response and remain dirty', () => {
  const submitted = project()
  const edited = { ...submitted, title: 'Changed during save' }
  const saved = { ...submitted, meta: { revision: 'new' } }
  const result = mergeSavedDraft(edited, submitted, saved)
  assert.equal(result.project.title, 'Changed during save')
  assert.equal(result.project.meta.revision, 'new')
  assert.equal(result.dirty, true)
})

test('successful saves use server normalization and clear unsaved status', () => {
  const submitted = project()
  const saved = { ...submitted, title: 'Normalized title', meta: { revision: 'new' } }
  assert.deepEqual(mergeSavedDraft(submitted, submitted, saved), { project: saved, dirty: false })
})

test('undoing to saved content clears dirty status even when metadata changes', () => {
  const submitted = project()
  const restored = structuredClone(submitted)
  const saved = { ...submitted, meta: { revision: 'new' } }
  assert.equal(mergeSavedDraft(restored, submitted, saved).dirty, false)
  assert.equal(contentSignature(saved), contentSignature(submitted))
})

test('guides may keep the current scene and survive reference cleanup', () => {
  const draft = project()
  draft.guides[0].steps.push({ id: 'current', sceneId: '', highlightHotspotId: 'mixed' })
  assert.deepEqual(projectChecks(draft), [])
  const next = removeProjectScene(draft, 'b')
  const step = next.guides[0].steps.find((item) => item.id === 'current')
  assert.ok(step)
  assert.equal(step.highlightHotspotId, 'mixed')
  assert.deepEqual(projectChecks(next), [])
})

test('the bundled demo product loads with its advertised drawer animation', async () => {
  const file = await readFile(new URL('../public/demo/product-demo.glb', import.meta.url))
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
  const model = await new GLTFLoader().parseAsync(buffer, '')
  assert.ok(model.scene.getObjectByName('Drawer'))
  assert.deepEqual(model.animations.map((animation) => animation.name), ['Open drawer'])
  const drawer = model.scene.getObjectByName('Drawer')
  const before = drawer.position.z
  const mixer = new THREE.AnimationMixer(model.scene)
  mixer.clipAction(model.animations[0]).play()
  mixer.update(0.8)
  assert.ok(drawer.position.z > before)
})
