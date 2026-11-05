import { WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

function readMetadata(gltf) {
  const materials = new Set()
  const nodes = new Set()
  const disposable = new Set()
  const scenes = gltf.scenes?.length ? gltf.scenes : [gltf.scene]
  let hasGeometry = false
  gltf.scene?.traverse((child) => {
    if (child.name) nodes.add(child.name)
    if (child.geometry) hasGeometry = true
    if (!child.isMesh) return
    const list = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of list) {
      if (material?.name) materials.add(material.name)
    }
  })
  for (const scene of scenes) {
    scene?.traverse((child) => {
      if (child.geometry) disposable.add(child.geometry)
      const list = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of list) {
        if (!material) continue
        disposable.add(material)
        for (const value of Object.values(material)) {
          if (value?.isTexture) disposable.add(value)
        }
      }
    })
  }
  const bitmaps = new Set()
  for (const resource of disposable) {
    const image = resource.source?.data
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) bitmaps.add(image)
    resource.dispose?.()
  }
  for (const bitmap of bitmaps) bitmap.close()
  if (!hasGeometry) throw new Error('The model’s default scene contains no geometry.')

  return {
    clips: [...new Set((gltf.animations || []).map((clip) => clip.name).filter(Boolean))],
    materials: [...materials].sort(),
    nodes: [...nodes],
  }
}

export async function detectModelMetadata(url, { signal } = {}) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Model download failed (HTTP ${response.status}).`)
  const bytes = await response.arrayBuffer()
  const base = response.url.startsWith('data:') || response.url.startsWith('blob:')
    ? ''
    : new URL('.', response.url || new URL(url, globalThis.location.href)).href
  signal?.throwIfAborted()

  const loader = new GLTFLoader()
  const draco = new DRACOLoader().setDecoderPath('/vendor/draco/')
  loader.setDRACOLoader(draco)
  loader.setMeshoptDecoder(MeshoptDecoder)

  let renderer
  let ktx2
  try {
    let gltf
    try {
      gltf = await loader.parseAsync(bytes, base)
    } catch (error) {
      if (!error?.message?.includes('setKTX2Loader must be called')) throw error
      signal?.throwIfAborted()
      renderer = new WebGLRenderer()
      ktx2 = new KTX2Loader().setTranscoderPath('/vendor/basis/').detectSupport(renderer)
      loader.setKTX2Loader(ktx2)
      gltf = await loader.parseAsync(bytes, base)
    }
    const metadata = readMetadata(gltf)
    signal?.throwIfAborted()
    return metadata
  } finally {
    draco.dispose()
    ktx2?.dispose()
    renderer?.dispose()
    renderer?.forceContextLoss()
  }
}

export function replaceProductModel(action, modelUrl) {
  if (action.modelUrl === modelUrl) return null
  return {
    modelUrl,
    ...(Array.isArray(action.annotations) && action.annotations.length > 0 && {
      annotations: action.annotations.map((annotation) => ({ ...annotation, needsPlacementReview: true })),
    }),
  }
}
