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

export function resetObjectMaterialColors(object) {
  let changed = 0

  object?.traverse?.((child) => {
    if (!child.isMesh) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]

    for (const material of materials) {
      const baseColor = material?.userData?.__3dvrBaseColor
      if (!baseColor || !material.color) continue
      material.color.copy(baseColor)
      material.needsUpdate = true
      changed += 1
    }
  })

  return changed
}

export function applyMaterialVariant(object, variant) {
  resetObjectMaterialColors(object)
  if (!object || !variant) return false

  const targetName = String(variant.materialName || '*').trim()
  const color = new THREE.Color(variant.color || '#ffffff')
  let changed = false

  object.traverse((child) => {
    if (!child.isMesh) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]

    for (const material of materials) {
      if (!material?.color) continue
      if (targetName !== '*' && material.name !== targetName) continue
      material.color.copy(color)
      material.needsUpdate = true
      changed = true
    }
  })

  return changed
}
