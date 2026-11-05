import { ACTION_TYPES, hotspotDestination, isRoomFallbackPair, normalizeHotspotActions } from '../actions/actionTypes.js'
import { guideStepTargetIssues } from '../guides/guidePlayback.js'

function text(value) {
  return typeof value === 'string' && value.trim()
}

export function projectChecks({ scenes = [], guides = [], startSceneId } = {}, { includeWarnings = false } = {}) {
  const issues = []
  const sceneIds = new Set(scenes.map((scene) => scene.id))
  const add = (message, tool, sceneId, hotspotId, guideId, stepId, actionId, detail) =>
    issues.push({ message, tool, sceneId, hotspotId, guideId, stepId, actionId, ...detail })
  if (!sceneIds.has(startSceneId)) add('Choose a starting scene for your visitors.', 'scene')
  for (const scene of scenes) {
    const name = scene.title || 'Untitled scene'
    if (!text(scene.image) && !text(scene.panorama?.manifestUrl)) add(`${name}: add a panorama for desktop and phone visitors.`, 'scene', scene.id)
    for (const hotspot of scene.hotspots || []) {
      const prefix = `${name} / ${hotspot.label || 'Untitled hotspot'}`
      const actions = normalizeHotspotActions(hotspot)
      if (!actions.length) add(`${prefix}: choose what happens when selected.`, 'hotspots', scene.id, hotspot.id)
      if (includeWarnings && actions.length > 1 && !isRoomFallbackPair(actions)) {
        add(`${prefix}: several actions run on one click. Preview the outcome.`, 'hotspots', scene.id, hotspot.id,
          undefined, undefined, undefined, { severity: 'warning' })
      }
      for (const action of actions) {
        let problem = ''
        switch (action.type) {
          case ACTION_TYPES.NAVIGATE_SCENE:
            if (!sceneIds.has(action.sceneId)) problem = 'choose an existing destination scene.'
            break
          case ACTION_TYPES.INSPECT_MODEL:
            if (!text(action.modelUrl)) problem = 'add a 3D model.'
            break
          case ACTION_TYPES.SHOW_INFO:
            if (!text(action.body)) problem = 'write the information visitors should see.'
            break
          case ACTION_TYPES.OPEN_URL:
            try {
              if (!text(action.url) || !['https:', 'http:'].includes(new URL(action.url, 'https://3dvr.invalid/').protocol)) throw new Error()
            } catch { problem = 'enter a web link.' }
            break
          case ACTION_TYPES.START_GUIDE:
            if (!guides.some((guide) => guide.id === action.guideId && guide.steps?.length)) problem = 'choose a guide with at least one step.'
            break
          case ACTION_TYPES.PLAY_ROOM_ANIMATION:
            if (!text(scene.spatial?.roomUrl) || !text(action.clip)) problem = 'add a VR room and choose its animation.'
            else if (scene.spatial.animations?.length && !scene.spatial.animations.includes(action.clip)) problem = 'choose an animation that exists in this room.'
            else if (includeWarnings && !Array.isArray(hotspot.spatialPosition)) {
              add(`${prefix}: the room action has no position in the tracked room.`, 'hotspots', scene.id, hotspot.id,
                undefined, undefined, action.id, { severity: 'warning' })
            }
            break
          default:
            problem = 'replace this unsupported action.'
        }
        if (problem) add(`${prefix}: ${problem}`, 'hotspots', scene.id, hotspot.id, undefined, undefined, action.id)
      }
    }
  }
  for (const guide of guides) {
    if (includeWarnings && !guide.steps?.length) add(`${guide.title || 'Untitled guide'}: the empty guide is hidden from visitors.`,
      'guides', undefined, undefined, guide.id, undefined, undefined, { severity: 'warning' })
    for (const step of guide.steps || []) {
      const scene = scenes.find((item) => item.id === step.sceneId)
      if (step.sceneId && !scene) {
        add(`${guide.title}: choose a scene for ${step.title || 'this step'}.`, 'guides', undefined, undefined, guide.id, step.id)
        continue
      }
      for (const issue of guideStepTargetIssues(step, scene)) {
        if (issue.severity === 'warning' && !includeWarnings) continue
        add(`${guide.title || 'Guide'} / ${step.title || 'Step'}: ${issue.message}`, 'guides',
          scene?.id, undefined, guide.id, step.id, undefined, { severity: issue.severity, field: issue.field })
      }
    }
  }
  if (includeWarnings && sceneIds.has(startSceneId)) {
    const visited = new Set()
    const sceneById = new Map(scenes.map((scene) => [scene.id, scene]))
    const pending = [startSceneId, ...guides.flatMap((guide) => (guide.steps || []).map((step) => step.sceneId))]
    while (pending.length) {
      const id = pending.pop()
      if (visited.has(id) || !sceneById.has(id)) continue
      visited.add(id)
      for (const hotspot of sceneById.get(id).hotspots || []) {
        const destination = hotspotDestination(hotspot, id, sceneIds)
        if (destination) pending.push(destination)
      }
    }
    for (const scene of scenes) {
      if (!visited.has(scene.id)) add(`${scene.title || 'Untitled scene'}: no visitor route from the start or a guide.`, 'scene', scene.id,
        undefined, undefined, undefined, undefined, { severity: 'warning' })
    }
  }
  return issues
}
