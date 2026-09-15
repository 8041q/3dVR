export const ACTION_TYPES = Object.freeze({
  NAVIGATE_SCENE: 'navigate-scene',
  INSPECT_MODEL: 'inspect-model',
  PLAY_ROOM_ANIMATION: 'play-room-animation',
  SHOW_INFO: 'show-info',
  OPEN_URL: 'open-url',
  START_GUIDE: 'start-guide',
})

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
        rotationY: 0,
        exposeAnimations: true,
        animationControls: [],
        materialVariants: [],
        annotations: [],
        viewer: {
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
    return hotspot.actions.filter((action) => action && typeof action.type === 'string')
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
