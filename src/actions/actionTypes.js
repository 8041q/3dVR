export const ACTION_TYPES = Object.freeze({
  NAVIGATE_SCENE: 'navigate-scene',
  INSPECT_MODEL: 'inspect-model',
  PLAY_ROOM_ANIMATION: 'play-room-animation',
  SHOW_INFO: 'show-info',
  OPEN_URL: 'open-url',
  START_GUIDE: 'start-guide',
})

export const ACTION_CHOICES = [
  { type: ACTION_TYPES.NAVIGATE_SCENE, label: 'Go to scene', description: 'Move the visitor to another scene.' },
  { type: ACTION_TYPES.SHOW_INFO, label: 'Show information', description: 'Display a title and text.' },
  { type: ACTION_TYPES.INSPECT_MODEL, label: 'Open a 3D product', description: 'Let visitors inspect and interact with a GLB model.' },
  { type: ACTION_TYPES.OPEN_URL, label: 'Open a link', description: 'Open a web page.' },
  { type: ACTION_TYPES.START_GUIDE, label: 'Start a guide', description: 'Begin a guided tour.' },
  { type: ACTION_TYPES.PLAY_ROOM_ANIMATION, label: 'Play a VR room animation', description: 'Play an animation in the imported Blender room.' },
]

function actionId() {
  return globalThis.crypto?.randomUUID?.() || `action-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createAnimationControl() {
  return {
    id: actionId(),
    label: 'Animation',
    clip: '',
  }
}

export function createMaterialVariant() {
  return {
    id: actionId(),
    label: 'Variant',
    materialName: '*',
    color: '#ffffff',
    textureUrl: '',
    textureRepeat: [1, 1],
    roughness: null,
    metalness: null,
  }
}

export function createModelAnnotation() {
  return {
    id: actionId(),
    label: 'Detail',
    body: '',
    position: [0, 0.8, 0],
    normal: [0, 0, 1],
    anchorNode: '',
    anchorPosition: null,
    anchorNormal: null,
  }
}

export function createAction(type = ACTION_TYPES.NAVIGATE_SCENE) {
  const id = actionId()

  switch (type) {
    case ACTION_TYPES.INSPECT_MODEL:
      return {
        id,
        type,
        title: 'Product',
        modelUrl: '',
        modelScale: 1,
        rotationY: -35,
        exposeAnimations: true,
        animationControls: [],
        materialVariants: [],
        annotations: [],
        viewer: {
          startPitch: 18,
          startZoom: 1,
          upAxis: 'y',
          orbitMode: 'free',
          allowPan: true,
          distance: 2.35,
          minZoom: 0.65,
          maxZoom: 3,
          backdropOpacity: 0.10,
          autoRotate: false,
          autoRotateSpeed: 0.65,
          exposure: 1,
          environmentIntensity: 1,
          showGround: true,
          shadowIntensity: 0.24,
          animationSpeed: 1,
        },
      }
    case ACTION_TYPES.PLAY_ROOM_ANIMATION:
      return {
        id,
        type,
        clip: '',
        behavior: 'toggle',
        loop: 'once',
        speed: 1,
      }
    case ACTION_TYPES.SHOW_INFO:
      return { id, type, title: 'Information', body: '' }
    case ACTION_TYPES.OPEN_URL:
      return { id, type, url: '', newTab: true }
    case ACTION_TYPES.START_GUIDE:
      return { id, type, guideId: '' }
    case ACTION_TYPES.NAVIGATE_SCENE:
    default:
      return { id, type: ACTION_TYPES.NAVIGATE_SCENE, sceneId: '' }
  }
}

export function normalizeHotspotActions(hotspot) {
  if (Array.isArray(hotspot?.actions) && hotspot.actions.length > 0) {
    const actions = hotspot.actions.filter((action) => action && typeof action.type === 'string')
    const reserved = new Set(actions.map((action) => action.id).filter(Boolean))
    const seen = new Set()
    return actions.map((action, index) => {
      if (action.id && !seen.has(action.id)) {
        seen.add(action.id)
        return action
      }
      // Older actions may lack an ID. Keep their edit targets stable until the next save.
      let id = `legacy-${hotspot.id || 'hotspot'}-action-${index}`
      while (reserved.has(id)) id += '-legacy'
      reserved.add(id)
      return { ...action, id }
    })
  }

  if (hotspot?.targetSceneId) {
    return [{
      id: `legacy-${hotspot.id || 'hotspot'}`,
      type: ACTION_TYPES.NAVIGATE_SCENE,
      sceneId: hotspot.targetSceneId,
    }]
  }

  return []
}

export function withHotspotActions(hotspot, actions) {
  const navigation = actions.find((action) => action.type === ACTION_TYPES.NAVIGATE_SCENE)
  return { ...hotspot, actions, targetSceneId: navigation?.sceneId || '' }
}

export function isPanoramaFallback(type) {
  return [ACTION_TYPES.SHOW_INFO, ACTION_TYPES.NAVIGATE_SCENE, ACTION_TYPES.START_GUIDE, ACTION_TYPES.OPEN_URL].includes(type)
}

export function isRoomFallbackPair(actions) {
  // Older projects used this exact ordering for the documented panorama fallback.
  return actions.length === 2 && actions[0].type === ACTION_TYPES.PLAY_ROOM_ANIMATION && isPanoramaFallback(actions[1].type)
}

export function runHotspotActions(hotspot, run) {
  const actions = normalizeHotspotActions(hotspot)
  if (isRoomFallbackPair(actions)) {
    return run(actions[0]) || run(actions[1])
  }
  let handled = false
  for (const action of actions) {
    if (run(action)) handled = true
  }
  return handled
}

export function visibleInPanorama(hotspot) {
  return normalizeHotspotActions(hotspot).some((action) => action.type !== ACTION_TYPES.PLAY_ROOM_ANIMATION)
}

export function hotspotDestination(hotspot, sourceId, sceneIds) {
  return normalizeHotspotActions(hotspot).findLast((action) =>
    action.type === ACTION_TYPES.NAVIGATE_SCENE && action.sceneId !== sourceId && sceneIds.has(action.sceneId))?.sceneId
}
