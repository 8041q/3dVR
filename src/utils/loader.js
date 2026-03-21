import * as THREE from 'three'

export function preloadTexture(url) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    loader.load(url, (tex) => resolve(tex), undefined, (err) => reject(err))
  })
}
