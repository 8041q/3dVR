import fs from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  applyMaterialVariant,
  resetObjectMaterialColors,
  resolveAnimationControls,
} from '../src/product/productControls.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const data = await fs.readFile('public/demo/product-demo.glb')
const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(arrayBuffer, '', resolve, reject)
})

assert(gltf.scene, 'Demo GLB has no scene')
assert(gltf.animations.length === 1, `Expected one animation, got ${gltf.animations.length}`)
assert(gltf.animations[0].name === 'Open drawer', 'Demo animation is not named Open drawer')

const controls = resolveAnimationControls({
  animationControls: [{ id: 'open', label: 'Open storage', clip: 'Open drawer' }],
  exposeAnimations: true,
}, gltf.animations.map((clip) => clip.name))
assert(controls[0].label === 'Open storage', 'Friendly animation control mapping failed')

const mixer = new THREE.AnimationMixer(gltf.scene)
const action = mixer.clipAction(gltf.animations[0])
action.setLoop(THREE.LoopOnce, 1)
action.clampWhenFinished = true
action.play()
mixer.update(1)

const drawer = gltf.scene.getObjectByName('Moving_drawer')
assert(drawer, 'Animated drawer node is missing')
assert(drawer.position.z > 0.7, `Animation did not move drawer as expected: z=${drawer.position.z}`)

let materialToTest = null
gltf.scene.traverse((child) => {
  if (!child.isMesh || materialToTest) return
  const materials = Array.isArray(child.material) ? child.material : [child.material]
  materialToTest = materials.find((material) => material?.color) || null
})
assert(materialToTest, 'Demo GLB has no color material for variant testing')
materialToTest.userData.__3dvrBaseColor = materialToTest.color.clone()
const original = materialToTest.color.clone()
assert(applyMaterialVariant(gltf.scene, {
  materialName: materialToTest.name || '*',
  color: '#12d46f',
}), 'Material variant did not apply to the demo GLB')
assert(!materialToTest.color.equals(original), 'Material color did not change')
resetObjectMaterialColors(gltf.scene)
assert(materialToTest.color.equals(original), 'Material reset did not restore the original demo GLB color')

console.log('[product-model] PASS - demo GLB loads, friendly animation mapping works, animation plays and material variants reset')
