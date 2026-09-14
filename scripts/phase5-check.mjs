import fs from 'node:fs/promises'
import { ACTION_TYPES, normalizeHotspotActions } from '../src/actions/actionTypes.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'))
const viewer = await fs.readFile('src/components/Viewer.jsx', 'utf8')
const desktopControls = await fs.readFile('src/components/DesktopControls.jsx', 'utf8')
const editor = await fs.readFile('src/components/editor/HotspotActionEditor.jsx', 'utf8')
const inspector = await fs.readFile('src/components/product/ProductInspector3D.jsx', 'utf8')
const server = await fs.readFile('server/index.js', 'utf8')
const upload = await fs.readFile('server/upload.js', 'utf8')
const compose = await fs.readFile('docker-compose.yml', 'utf8')

const legacy = normalizeHotspotActions({ id: 'legacy', targetSceneId: 'room' })
assert(legacy.length === 1, 'Legacy navigation hotspot did not normalize')
assert(legacy[0].type === ACTION_TYPES.NAVIGATE_SCENE, 'Legacy hotspot normalized to wrong action type')
assert(legacy[0].sceneId === 'room', 'Legacy hotspot lost target scene')

const explicit = normalizeHotspotActions({
  actions: [{ id: 'a', type: ACTION_TYPES.SHOW_INFO, title: 'Test' }],
  targetSceneId: 'ignored',
})
assert(explicit.length === 1 && explicit[0].type === ACTION_TYPES.SHOW_INFO, 'Explicit actions should override legacy target')

assert(packageJson.scripts.dev === 'node scripts/dev.mjs', 'npm run dev is not the single-process-group developer command')
assert(packageJson.scripts.start === 'node scripts/start.mjs', 'npm start is not the production process-group command')
assert(viewer.includes('normalizeHotspotActions'), 'Viewer is not wired to hotspot actions')
assert(viewer.includes('<ProductInspector3D'), 'Viewer is not wired to product inspection')
assert(editor.includes('Inspect 3D model'), 'Editor does not expose the 3D inspection action')
assert(inspector.includes('GLTFLoader'), 'Product inspector does not load GLB/glTF models')
assert(inspector.includes('AnimationMixer'), 'Product inspector does not support model animation clips')
assert(desktopControls.includes('state.current.yaw += dx'), 'Horizontal desktop drag was not inverted')
assert(desktopControls.includes('state.current.pitch + dy'), 'Vertical desktop drag was not inverted')
assert(server.includes("express.static(distRoot"), 'Production server does not serve the built client')
assert(upload.includes("'.glb'"), 'Generic asset upload does not allow GLB')
assert(compose.includes('worker:'), 'Docker Compose does not define the panorama worker service')

const emojiPattern = /[\u{1F300}-\u{1FAFF}]/u
const sourceFiles = [
  'src/apps/EditorApp.jsx',
  'src/components/ViewerModeBar.jsx',
  'src/components/ProjectOfflineControl.jsx',
  'src/components/editor/EditorToolbar.jsx',
  'src/components/editor/SceneList.jsx',
  'src/components/editor/HotspotPanel.jsx',
]
for (const file of sourceFiles) {
  const text = await fs.readFile(file, 'utf8')
  assert(!emojiPattern.test(text), `Emoji icon still present in ${file}`)
}

console.log('[phase5] PASS - actions, model inspection, inverted look controls, deployment and no-emoji UI checks passed')
