import * as THREE from 'three'

export function resolveAnimationControls(inspection, animations = []) {
  const configured = (inspection?.animationControls || [])
    .filter((control) => control?.clip)
    .map((control) => ({
      id: control.id || control.clip,
      label: control.label || control.clip,
      clip: control.clip,
    }))

  if (inspection?.exposeAnimations === false) return configured

  const mapped = new Set(configured.map((control) => control.clip))
  const automatic = animations
    .filter((name) => !mapped.has(name))
    .map((name) => ({ id: `auto-${name}`, label: name, clip: name }))

  return [...configured, ...automatic]
}

function ensureBaseMaterialState(material) {
  if (!material?.userData) return
  if (!material.userData.__3dvrBaseMaterialState) {
    material.userData.__3dvrBaseMaterialState = {
      color: material.color?.clone?.() || null,
      map: material.map || null,
      roughness: Number.isFinite(material.roughness) ? material.roughness : null,
      metalness: Number.isFinite(material.metalness) ? material.metalness : null,
    }
  }
}

function targetMaterials(object, materialName = '*') {
  const result = []
  const targetName = String(materialName || '*').trim() || '*'

  object?.traverse?.((child) => {
    if (!child.isMesh) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]

    for (const material of materials) {
      if (!material) continue
      ensureBaseMaterialState(material)
      if (targetName !== '*' && material.name !== targetName) continue
      result.push(material)
    }
  })

  return result
}

export function resetObjectMaterials(object) {
  if (object?.userData) {
    object.userData.__3dvrVariantGeneration = Number(object.userData.__3dvrVariantGeneration || 0) + 1
  }

  const variantTextures = new Set()
  let changed = 0

  object?.traverse?.((child) => {
    if (!child.isMesh) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]

    for (const material of materials) {
      if (!material) continue
      ensureBaseMaterialState(material)
      const base = material.userData.__3dvrBaseMaterialState
      const variantTexture = material.userData.__3dvrVariantTexture

      if (variantTexture && variantTexture !== base.map) variantTextures.add(variantTexture)
      delete material.userData.__3dvrVariantTexture

      if (base.color && material.color) material.color.copy(base.color)
      if ('map' in material) material.map = base.map || null
      if (base.roughness != null && 'roughness' in material) material.roughness = base.roughness
      if (base.metalness != null && 'metalness' in material) material.metalness = base.metalness
      material.needsUpdate = true
      changed += 1
    }
  })

  for (const texture of variantTextures) texture.dispose?.()
  return changed
}

// Backwards-compatible name used by earlier phases. It now restores the full
// material state, not only color.
export function resetObjectMaterialColors(object) {
  return resetObjectMaterials(object)
}

function loadTexture(url, repeat = [1, 1]) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        texture.flipY = false
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        const repeatX = Math.max(0.01, Number(repeat?.[0]) || 1)
        const repeatY = Math.max(0.01, Number(repeat?.[1]) || 1)
        texture.repeat.set(repeatX, repeatY)
        texture.needsUpdate = true
        resolve(texture)
      },
      undefined,
      (error) => reject(error instanceof Error ? error : new Error('Could not load finish texture.')),
    )
  })
}

export async function applyMaterialVariant(object, variant) {
  resetObjectMaterials(object)
  if (!object || !variant) return false
  const generation = Number(object.userData?.__3dvrVariantGeneration || 0)

  const materials = targetMaterials(object, variant.materialName)
  if (materials.length === 0) return false

  const color = variant.color ? new THREE.Color(variant.color) : null
  const roughness = variant.roughness === '' || variant.roughness == null
    ? null
    : THREE.MathUtils.clamp(Number(variant.roughness), 0, 1)
  const metalness = variant.metalness === '' || variant.metalness == null
    ? null
    : THREE.MathUtils.clamp(Number(variant.metalness), 0, 1)

  let texture = null
  if (variant.textureUrl) {
    try {
      texture = await loadTexture(variant.textureUrl, variant.textureRepeat)
      if (Number(object.userData?.__3dvrVariantGeneration || 0) !== generation) {
        texture.dispose?.()
        return false
      }
    } catch (error) {
      console.warn('[product] finish texture failed', variant.textureUrl, error)
      return false
    }
  }

  for (const material of materials) {
    if (color && material.color) material.color.copy(color)
    if (texture && 'map' in material) {
      material.map = texture
      material.userData.__3dvrVariantTexture = texture
    }
    if (roughness != null && 'roughness' in material) material.roughness = roughness
    if (metalness != null && 'metalness' in material) material.metalness = metalness
    material.needsUpdate = true
  }

  return true
}
