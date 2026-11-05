import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guideEntryKey, moveGuidePlayback } from '../src/guides/guidePlayback.js'
import { actionUrl } from '../src/viewer/actionUrl.js'
import { resolveSceneId } from '../src/viewer/sceneSelection.js'
import { hotspotDestination, runHotspotActions, visibleInPanorama } from '../src/actions/actionTypes.js'
import { basePanoramaTiles, panoramaTileUrl, readPanoramaManifest } from '../src/panorama/panoramaSource.js'
import { DEFAULT_PHONE_VIEW_PROFILE, PHONE_VIEW_MODES, normalizePhoneViewProfile } from '../src/phoneViewProfile.js'

test('saved dollhouse profiles fall back to the standard phone view while preserving headset calibration', () => {
  const profile = normalizePhoneViewProfile({ mode: 'dollhouse', ipdMm: 68, fovDeg: 82 })
  assert.equal(profile.mode, PHONE_VIEW_MODES.MAGIC_WINDOW)
  assert.equal(profile.ipdMm, 68)
  assert.equal(profile.fovDeg, 82)
  assert.equal(normalizePhoneViewProfile({ mode: PHONE_VIEW_MODES.HEADSET_STEREO }).mode, PHONE_VIEW_MODES.HEADSET_STEREO)
  assert.equal(normalizePhoneViewProfile({ mode: 'obsolete' }).mode, DEFAULT_PHONE_VIEW_PROFILE.mode)
})

test('a late guide timer cannot advance a new step or a restarted guide', () => {
  const start = { guideId: 'welcome', instanceId: 1, entry: 0, stepIndex: 0 }
  const firstEntry = guideEntryKey(start)
  const secondStep = moveGuidePlayback(start, firstEntry, 3, 1)
  assert.equal(secondStep.stepIndex, 1)
  assert.equal(moveGuidePlayback(secondStep, firstEntry, 3, 1), secondStep)
  assert.equal(moveGuidePlayback(null, firstEntry, 3, 1), null)
  const restarted = { ...start, instanceId: 2 }
  assert.equal(moveGuidePlayback(restarted, firstEntry, 3, 1), restarted)
})

test('revisiting a guide step creates a fresh entry and advancing the last step ends the guide', () => {
  const start = { guideId: 'welcome', instanceId: 1, entry: 0, stepIndex: 0 }
  const secondStep = moveGuidePlayback(start, guideEntryKey(start), 2, 1)
  const previousStep = moveGuidePlayback(secondStep, guideEntryKey(secondStep), 2, -1)
  assert.equal(previousStep.stepIndex, 0)
  assert.notEqual(guideEntryKey(previousStep), guideEntryKey(start))
  assert.equal(moveGuidePlayback(secondStep, guideEntryKey(secondStep), 2, 1), null)
})

test('viewer action links reject script and file schemes while preserving old relative links', () => {
  const base = 'https://example.test/v/demo'
  assert.equal(actionUrl('/details', base), 'https://example.test/details')
  assert.equal(actionUrl('https://other.test', base), 'https://other.test/')
  assert.equal(actionUrl('http://[broken', base), null)
  assert.equal(actionUrl('  JavaScript:alert(1)', base), null)
  assert.equal(actionUrl('data:text/html,test', base), null)
  assert.equal(actionUrl('file:///temp/test', base), null)
})

test('preview resolves removed selections and old start scene IDs without showing a blank page', () => {
  const scenes = [{ id: 'entrance' }, { id: 'garden' }]
  assert.equal(resolveSceneId(scenes, 'garden', 'entrance'), 'garden')
  assert.equal(resolveSceneId(scenes, 'removed', 'garden'), 'garden')
  assert.equal(resolveSceneId(scenes, 'removed', 'outdated'), 'entrance')
  assert.equal(resolveSceneId([], 'removed', 'outdated'), null)
})

test('a tracked-room action uses its documented fallback only when playback is unavailable', () => {
  const room = { id: 'room', type: 'play-room-animation', clip: 'Open' }
  const info = { id: 'info', type: 'show-info', body: 'About this room' }
  const hotspot = { actions: [room, info] }
  function calls(roomReady, actions) {
    const ran = []
    assert.equal(runHotspotActions(actions, (action) => {
      ran.push(action.id)
      return action.id !== 'room' || roomReady
    }), true)
    return ran
  }
  assert.deepEqual(calls(true, hotspot), ['room'])
  assert.deepEqual(calls(false, hotspot), ['room', 'info'])
  assert.deepEqual(calls(true, { actions: [info, room] }), ['info', 'room'])
  assert.equal(visibleInPanorama({ actions: [room] }), false)
  assert.equal(visibleInPanorama(hotspot), true)
  const links = { actions: [
    { type: 'navigate-scene', sceneId: 'a' },
    { type: 'navigate-scene', sceneId: 'b' },
    { type: 'navigate-scene', sceneId: 'missing' },
  ] }
  assert.equal(hotspotDestination(links, 'start', new Set(['a', 'b'])), 'b')
})

test('tiled panorama readiness covers the six base faces relative to the manifest', () => {
  const input = {
    kind: 'multires-cubemap', projection: 'cubemap-multires', baseLevel: 0,
    faces: ['front', 'right', 'back', 'left', 'up', 'down'].map((id) => ({ id })),
    levels: [{ id: 0, faceSize: 512, tilesPerEdge: 1, tileUrlTemplate: './{level}/{face}/{col}_{row}.webp' }],
  }
  const url = 'https://tour.test/media/revision/manifest.json'
  const manifest = readPanoramaManifest(input, url)
  const tiles = basePanoramaTiles(manifest)
  assert.equal(tiles.length, 6)
  assert.equal(panoramaTileUrl(tiles[0]), 'https://tour.test/media/revision/0/front/0_0.webp')
  assert.throws(() => readPanoramaManifest({ ...input, faces: input.faces.slice(1) }, url), /Unsupported panorama/)
})
