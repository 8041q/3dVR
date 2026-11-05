import * as THREE from 'three'

const variantGenerations = new WeakMap()

export function resolveAnimationControls(inspection, animations = []) {
  const available = new Set(animations)
  const configured = (inspection?.animationControls || [])
    .filter((control) => control?.clip && available.has(control.clip))
    .map((control) => ({
      id: control.id || control.clip,
      label: control.label || control.clip,
      clip: control.clip,
    }))

  if (inspection?.exposeAnimations === false) return configured

  const mapped = new Set(configured.map((control) => control.clip))
  const automatic = [...available]
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
  const result = new Set()
  const targetName = String(materialName || '*').trim() || '*'

  object?.traverse?.((child) => {
    if (!child.isMesh) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]

    for (const material of materials) {
      if (!material) continue
      if (targetName !== '*' && material.name !== targetName) continue
      result.add(material)
    }
  })

  return result
}

function nextVariantGeneration(object) {
  const next = (variantGenerations.get(object) || 0) + 1
  variantGenerations.set(object, next)
  return next
}

function restoreBaseMaterials(object) {
  const variantTextures = new Set()
  const materials = targetMaterials(object)
  for (const material of materials) {
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
  }

  for (const texture of variantTextures) texture.dispose?.()
  return materials.size
}

export function resetObjectMaterials(object) {
  if (!object) return 0
  nextVariantGeneration(object)
  return restoreBaseMaterials(object)
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
  if (!object) return false
  const generation = nextVariantGeneration(object)
  if (!variant) return false

  const materials = targetMaterials(object, variant.materialName)
  if (!materials.size || (variant.textureUrl && ![...materials].some((material) => 'map' in material))) return false

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
    } catch (error) {
      console.warn('[product] finish texture failed', variant.textureUrl, error)
      return false
    }
  }

  if (variantGenerations.get(object) !== generation) {
    texture?.dispose?.()
    return false
  }
  restoreBaseMaterials(object)
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
