import { ACTION_TYPES, normalizeHotspotActions } from '../actions/actionTypes.js'

export function projectChecks({ scenes = [], guides = [], startSceneId } = {}) {
  const issues = []
  const sceneIds = new Set(scenes.map((scene) => scene.id))
  const add = (message, tool, sceneId, hotspotId, guideId, stepId) => issues.push({ message, tool, sceneId, hotspotId, guideId, stepId })
  if (!sceneIds.has(startSceneId)) add('Choose a starting scene for your visitors.', 'scene')
  for (const scene of scenes) {
    const name = scene.title || 'Untitled scene'
    if (!scene.image && !scene.panorama?.manifestUrl) add(`${name}: add a panorama for desktop and phone visitors.`, 'scene', scene.id)
    for (const hotspot of scene.hotspots || []) {
      const prefix = `${name} / ${hotspot.label || 'Untitled hotspot'}`
      const actions = normalizeHotspotActions(hotspot)
      if (!actions.length) add(`${prefix}: choose what happens when selected.`, 'hotspots', scene.id, hotspot.id)
      for (const action of actions) {
        let problem = ''
        switch (action.type) {
          case ACTION_TYPES.NAVIGATE_SCENE:
            if (!sceneIds.has(action.sceneId)) problem = 'choose an existing destination scene.'
            break
          case ACTION_TYPES.INSPECT_MODEL:
            if (!action.modelUrl?.trim()) problem = 'add a 3D model.'
            break
          case ACTION_TYPES.SHOW_INFO:
            if (!action.body?.trim()) problem = 'write the information visitors should see.'
            break
          case ACTION_TYPES.OPEN_URL:
            try {
              if (!['https:', 'http:'].includes(new URL(action.url).protocol)) throw new Error()
            } catch { problem = 'enter a complete http:// or https:// link.' }
            break
          case ACTION_TYPES.START_GUIDE:
            if (!guides.some((guide) => guide.id === action.guideId && guide.steps?.length)) problem = 'choose a guide with at least one step.'
            break
          case ACTION_TYPES.PLAY_ROOM_ANIMATION:
            if (!scene.spatial?.roomUrl || !action.clip?.trim()) problem = 'add a VR room and choose its animation.'
            else if (scene.spatial.animations?.length && !scene.spatial.animations.includes(action.clip)) problem = 'choose an animation that exists in this room.'
            break
          default:
            problem = 'replace this unsupported action.'
        }
        if (problem) add(`${prefix}: ${problem}`, 'hotspots', scene.id, hotspot.id)
      }
    }
  }
  for (const guide of guides) {
    if (!guide.steps?.length) add(`${guide.title || 'Untitled guide'}: add a step or remove the empty guide.`, 'guides', undefined, undefined, guide.id)
    for (const step of guide.steps || []) {
      const scene = scenes.find((item) => item.id === step.sceneId)
      if (step.sceneId && !scene) add(`${guide.title}: choose a scene for ${step.title || 'this step'}.`, 'guides', undefined, undefined, guide.id, step.id)
      const hotspots = scene?.hotspots || (!step.sceneId ? scenes.flatMap((item) => item.hotspots || []) : [])
      for (const field of ['highlightHotspotId', 'advanceOnHotspotId', 'autoActivateHotspotId']) {
        if (step[field] && !hotspots.some((hotspot) => hotspot.id === step[field])) {
          add(`${guide.title} / ${step.title || 'Step'}: reselect the missing hotspot.`, 'guides', scene?.id, undefined, guide.id, step.id)
          break
        }
      }
    }
  }
  return issues
}
