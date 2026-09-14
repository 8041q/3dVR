export const ACTION_TYPES = Object.freeze({
  NAVIGATE_SCENE: 'navigate-scene',
  INSPECT_MODEL: 'inspect-model',
  SHOW_INFO: 'show-info',
  OPEN_URL: 'open-url',
})

export function createAction(type = ACTION_TYPES.NAVIGATE_SCENE) {
  const id = globalThis.crypto?.randomUUID?.() || `action-${Date.now()}-${Math.random().toString(36).slice(2)}`

  switch (type) {
    case ACTION_TYPES.INSPECT_MODEL:
      return {
        id,
        type,
        title: 'Product',
        modelUrl: '',
        modelScale: 1,
        rotationY: 0,
        exposeAnimations: true,
      }
    case ACTION_TYPES.SHOW_INFO:
      return { id, type, title: 'Information', body: '' }
    case ACTION_TYPES.OPEN_URL:
      return { id, type, url: '', newTab: true }
    case ACTION_TYPES.NAVIGATE_SCENE:
    default:
      return { id, type: ACTION_TYPES.NAVIGATE_SCENE, sceneId: '' }
  }
}

export function normalizeHotspotActions(hotspot) {
  if (Array.isArray(hotspot?.actions) && hotspot.actions.length > 0) {
    return hotspot.actions.filter((action) => action && typeof action.type === 'string')
  }

  // Backwards compatibility with the Phase 1-4 navigation hotspot schema.
  if (hotspot?.targetSceneId) {
    return [{
      id: `legacy-${hotspot.id || 'hotspot'}`,
      type: ACTION_TYPES.NAVIGATE_SCENE,
      sceneId: hotspot.targetSceneId,
    }]
  }

  return []
}
