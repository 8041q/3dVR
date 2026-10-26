import { mkdir, writeFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// GLTFExporter uses FileReader for the final binary Blob; Node supplies Blob.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.() })
  }
}

const scene = new THREE.Scene()
const cabinet = new THREE.Group()
cabinet.name = 'Demo cabinet'
scene.add(cabinet)
const shell = new THREE.MeshStandardMaterial({ name: 'Cabinet finish', color: '#d8d1c4', roughness: 0.55 })
const metal = new THREE.MeshStandardMaterial({ name: 'Hardware', color: '#858e98', metalness: 0.8, roughness: 0.25 })
function box(parent, name, size, position, material = shell) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.name = name
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}
box(cabinet, 'Left side', [0.08, 1.25, 0.65], [-0.46, 0.75, 0])
box(cabinet, 'Right side', [0.08, 1.25, 0.65], [0.46, 0.75, 0])
box(cabinet, 'Top', [1, 0.08, 0.7], [0, 1.415, 0])
box(cabinet, 'Base', [1, 0.08, 0.65], [0, 0.165, 0])
box(cabinet, 'Back', [0.86, 1.17, 0.05], [0, 0.79, -0.3])
box(cabinet, 'Shelf', [0.86, 0.05, 0.6], [0, 0.64, 0])
for (const x of [-0.38, 0.38]) for (const z of [-0.24, 0.24]) box(cabinet, `Foot ${x} ${z}`, [0.09, 0.15, 0.09], [x, 0.075, z], metal)
const drawer = new THREE.Group()
drawer.name = 'Drawer'
drawer.position.set(0, 1.05, 0)
cabinet.add(drawer)
box(drawer, 'Drawer front', [0.85, 0.48, 0.07], [0, 0, 0.345])
box(drawer, 'Drawer bottom', [0.78, 0.04, 0.55], [0, -0.2, 0.03])
box(drawer, 'Drawer left', [0.04, 0.35, 0.55], [-0.37, -0.03, 0.03])
box(drawer, 'Drawer right', [0.04, 0.35, 0.55], [0.37, -0.03, 0.03])
box(drawer, 'Handle', [0.28, 0.045, 0.05], [0, 0.06, 0.405], metal)
const animation = new THREE.AnimationClip('Open drawer', 1.6, [
  new THREE.VectorKeyframeTrack('Drawer.position', [0, 1.6], [0, 1.05, 0, 0, 1.05, 0.5]),
])
const binary = await new GLTFExporter().parseAsync(scene, { binary: true, animations: [animation] })
const output = new URL('../public/demo/product-demo.glb', import.meta.url)
await mkdir(new URL('../public/demo/', import.meta.url), { recursive: true })
await writeFile(output, Buffer.from(binary))
console.log(`Generated product-demo.glb (${binary.byteLength} bytes)`)
