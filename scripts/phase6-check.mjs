import fs from 'node:fs/promises'
import { ACTION_TYPES } from '../src/actions/actionTypes.js'
import { createGuide, createGuideStep } from '../src/guides/guideSchema.js'
import * as THREE from 'three'
import {
  applyMaterialVariant,
  resetObjectMaterialColors,
  resolveAnimationControls,
} from '../src/product/productControls.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'))
const viewer = await fs.readFile('src/components/Viewer.jsx', 'utf8')
const editor = await fs.readFile('src/components/editor/GuideEditor.jsx', 'utf8')
const actionEditor = await fs.readFile('src/components/editor/HotspotActionEditor.jsx', 'utf8')
const modelEditor = await fs.readFile('src/components/editor/ModelAuthoringEditor.jsx', 'utf8')
const inspector = await fs.readFile('src/components/product/ProductInspector3D.jsx', 'utf8')
const projects = await fs.readFile('server/projects.js', 'utf8')
const serverIndex = await fs.readFile('server/index.js', 'utf8')
const guides = JSON.parse(await fs.readFile('server/data/guides.json', 'utf8'))
const serviceWorker = await fs.readFile('public/sw.js', 'utf8')
const scenes = JSON.parse(await fs.readFile('server/data/scenes.json', 'utf8'))

assert(packageJson.version === '0.6.0', 'Package version is not Phase 6')
assert(packageJson.scripts['test:phase6'] === 'node scripts/phase6-check.mjs', 'Phase 6 test script is missing')
assert(ACTION_TYPES.START_GUIDE === 'start-guide', 'Start-guide action type is missing')


const configuredControls = resolveAnimationControls({
  animationControls: [{ id: 'friendly', label: 'Open storage', clip: 'Open drawer' }],
  exposeAnimations: true,
}, ['Open drawer', 'Raise headrest'])
assert(configuredControls[0].label === 'Open storage', 'Friendly animation label was not preserved')
assert(configuredControls.some((control) => control.clip === 'Raise headrest'), 'Unmapped model clips were not preserved')

const material = new THREE.MeshBasicMaterial({ color: '#ff0000' })
material.name = 'Fabric'
material.userData.__3dvrBaseColor = material.color.clone()
const testObject = new THREE.Group()
testObject.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material))
assert(applyMaterialVariant(testObject, { materialName: 'Fabric', color: '#00ff00' }), 'Material variant did not apply')
assert(material.color.g > 0.99 && material.color.r < 0.01, 'Material variant applied the wrong color')
resetObjectMaterialColors(testObject)
assert(material.color.r > 0.99 && material.color.g < 0.01, 'Material reset did not restore the original color')

const guide = createGuide()
const step = createGuideStep('room')
assert(Array.isArray(guide.steps), 'New guide does not contain a steps array')
assert(step.sceneId === 'room', 'New guide step lost its scene')
assert(step.inspectionCommand && 'animationClip' in step.inspectionCommand, 'Guide step has no product command contract')

assert(viewer.includes('<GuideOverlay'), 'Desktop guide overlay is not wired into Viewer')
assert(viewer.includes('<GuideWorldPanel'), 'Immersive guide panel is not wired into Viewer')
assert(viewer.includes('advanceOnHotspotId'), 'Guide hotspot auto-advance is not wired')
assert(viewer.includes('autoActivateHotspotId'), 'Guide auto hotspot activation is not wired')
assert(viewer.includes('inspectorRef.current?.applyVariant'), 'Guide/product material command is not wired')
assert(viewer.includes('inspectorRef.current?.playAnimation'), 'Guide/product animation command is not wired')
assert(editor.includes('Upload narration'), 'Guide narration authoring is missing')
assert(editor.includes('Advance after visitor selects'), 'Guide hotspot completion authoring is missing')
assert(actionEditor.includes('Start guide'), 'Hotspots cannot launch a guide')
assert(modelEditor.includes('Scan model'), 'GLB animation scanning is missing from product authoring')
assert(modelEditor.includes('Material variants'), 'Product material variant authoring is missing')
assert(modelEditor.includes('Model annotations'), 'Product annotation authoring is missing')
assert(inspector.includes('applyVariant'), 'Product inspector cannot apply variants')
assert(inspector.includes('showAnnotation'), 'Product inspector cannot open annotations')
assert(inspector.includes('resolveAnimationControls'), 'Product inspector does not use designer animation controls')
assert(serverIndex.includes("'/api/guides'"), 'Guide API is not registered')
assert(projects.includes('guides'), 'Project manifest does not include guides')
assert(projects.includes("'narrationUrl'"), 'Guide narration is not included in offline asset discovery')
assert(serviceWorker.includes('status: 206'), 'Offline service worker does not support byte-range media responses')
assert(serviceWorker.includes('Content-Range'), 'Offline service worker is missing Content-Range handling')

assert(guides.length > 0 && guides[0].steps.length >= 3, 'Demo guide is missing or incomplete')
const startGuideHotspot = scenes.flatMap((scene) => scene.hotspots || [])
  .find((hotspot) => (hotspot.actions || []).some((action) => action.type === 'start-guide'))
assert(startGuideHotspot, 'Demo project has no in-world start-guide hotspot')

const productAction = scenes.flatMap((scene) => scene.hotspots || [])
  .flatMap((hotspot) => hotspot.actions || [])
  .find((action) => action.type === 'inspect-model')
assert(productAction?.animationControls?.some((control) => control.label === 'Open storage'), 'Demo product has no friendly animation label')
assert(productAction?.materialVariants?.length >= 2, 'Demo product has no material variants')
assert(productAction?.annotations?.length >= 1, 'Demo product has no annotations')

const emojiPattern = /[\u{1F300}-\u{1FAFF}]/u
const sourcePaths = []
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = `${directory}/${entry.name}`
    if (entry.isDirectory()) await walk(full)
    else if (/\.(?:js|jsx|mjs)$/.test(entry.name)) sourcePaths.push(full)
  }
}
await walk('src')
for (const file of sourcePaths) {
  const text = await fs.readFile(file, 'utf8')
  assert(!emojiPattern.test(text), `Emoji icon/codepoint found in ${file}`)
}

console.log('[phase6] PASS - guides, narration, product controls, variants, annotations and offline manifest wiring verified')
