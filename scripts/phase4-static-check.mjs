import fs from 'node:fs/promises'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const viewer = await fs.readFile('src/components/Viewer.jsx', 'utf8')
const actions = await fs.readFile('src/input/actions.js', 'utf8')
const remote = await fs.readFile('src/input/RemoteInputAdapter.jsx', 'utf8')
const phoneStereo = await fs.readFile('src/components/PhoneStereoRenderer.jsx', 'utf8')
const xr = await fs.readFile('src/components/XRControllerInput.jsx', 'utf8')

assert(viewer.includes('<PhoneStereoRenderer'), 'Viewer is not wired to phone stereo rendering')
assert(viewer.includes('<XRControllerInput'), 'Viewer is not wired to XR controller input')
assert(viewer.includes('<GazeCursor'), 'Viewer is not wired to gaze input')
assert(actions.includes("SELECT: 'SELECT'"), 'Unified SELECT action is missing')
assert(remote.includes('__3dvrInput'), 'Remote input seam is missing')
assert(phoneStereo.includes('StereoCamera'), 'Phone stereo renderer is missing StereoCamera')
assert(xr.includes("addEventListener('select'"), 'XR controller select handling is missing')

console.log('[phase4] PASS - unified inputs and phone/WebXR paths are wired')
