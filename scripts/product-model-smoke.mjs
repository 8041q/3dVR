import fs from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

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

const mixer = new THREE.AnimationMixer(gltf.scene)
const action = mixer.clipAction(gltf.animations[0])
action.setLoop(THREE.LoopOnce, 1)
action.clampWhenFinished = true
action.play()
mixer.update(1)

const drawer = gltf.scene.getObjectByName('Moving_drawer')
assert(drawer, 'Animated drawer node is missing')
assert(drawer.position.z > 0.7, `Animation did not move drawer as expected: z=${drawer.position.z}`)

console.log('[product-model] PASS - demo GLB loads and Open drawer animation plays')
