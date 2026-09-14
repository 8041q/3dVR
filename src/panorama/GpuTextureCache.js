import * as THREE from 'three'

function estimateTextureBytes(texture) {
  const image = texture?.image
  const width = image?.width || image?.videoWidth || 0
  const height = image?.height || image?.videoHeight || 0
  // Browser-decoded WebP/JPEG ultimately occupies roughly RGBA8-sized GPU memory.
  return Math.max(1, width * height * 4)
}

export class GpuTextureCache {
  constructor({ maxBytes = 192 * 1024 * 1024 } = {}) {
    this.maxBytes = maxBytes
    this.entries = new Map()
    this.totalBytes = 0
    this.loader = new THREE.TextureLoader()
  }

  setBudget(maxBytes) {
    this.maxBytes = Math.max(16 * 1024 * 1024, maxBytes)
    this.evict()
  }

  async acquire(url) {
    let entry = this.entries.get(url)

    if (entry) {
      entry.refs += 1
      entry.lastUsed = performance.now()
      if (entry.texture) return entry.texture
      return entry.promise
    }

    entry = {
      url,
      refs: 1,
      lastUsed: performance.now(),
      texture: null,
      bytes: 0,
      promise: null,
    }

    entry.promise = this.loader.loadAsync(url).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.generateMipmaps = false
      texture.needsUpdate = true

      entry.texture = texture
      entry.bytes = estimateTextureBytes(texture)
      entry.promise = null
      this.totalBytes += entry.bytes
      this.evict()
      return texture
    }).catch((error) => {
      this.entries.delete(url)
      throw error
    })

    this.entries.set(url, entry)
    return entry.promise
  }

  release(url) {
    const entry = this.entries.get(url)
    if (!entry) return
    entry.refs = Math.max(0, entry.refs - 1)
    entry.lastUsed = performance.now()
    this.evict()
  }

  touch(url) {
    const entry = this.entries.get(url)
    if (entry) entry.lastUsed = performance.now()
  }

  evict() {
    if (this.totalBytes <= this.maxBytes) return

    const candidates = [...this.entries.values()]
      .filter((entry) => entry.refs === 0 && entry.texture)
      .sort((a, b) => a.lastUsed - b.lastUsed)

    for (const entry of candidates) {
      if (this.totalBytes <= this.maxBytes) break
      entry.texture.dispose()
      this.totalBytes -= entry.bytes
      this.entries.delete(entry.url)
    }
  }

  clear() {
    for (const entry of this.entries.values()) {
      entry.texture?.dispose()
    }
    this.entries.clear()
    this.totalBytes = 0
  }

  stats() {
    return {
      entries: this.entries.size,
      bytes: this.totalBytes,
      maxBytes: this.maxBytes,
    }
  }
}

export const panoramaTextureCache = new GpuTextureCache()
