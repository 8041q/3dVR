import { ACTION_TYPES, normalizeHotspotActions, withHotspotActions } from '../actions/actionTypes.js'
import { GUIDE_ADVANCE, guideProductTarget } from '../guides/guidePlayback.js'

function clearMissingHotspots(guides, scenes) {
  const idsByScene = new Map(scenes.map((scene) => [scene.id, new Set((scene.hotspots || []).map((hotspot) => hotspot.id))]))
  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]))
  const allIds = new Set([...idsByScene.values()].flatMap((ids) => [...ids]))
  return guides.map((guide) => ({
    ...guide,
    steps: (guide.steps || []).filter((step) => !step.sceneId || idsByScene.has(step.sceneId)).map((step) => {
      const patch = {}
      const ids = step.sceneId ? idsByScene.get(step.sceneId) : allIds
      for (const key of ['highlightHotspotId', 'advanceOnHotspotId', 'autoActivateHotspotId']) {
        if (step[key] && !ids.has(step[key])) patch[key] = ''
      }
      if (patch.advanceOnHotspotId === '' && step.advanceMode === GUIDE_ADVANCE.HOTSPOT) {
        patch.advanceMode = GUIDE_ADVANCE.MANUAL
      }
      if (patch.advanceOnHotspotId === '' && step.advanceMode === GUIDE_ADVANCE.EITHER) {
        patch.advanceMode = Number(step.autoAdvanceMs) > 0 ? GUIDE_ADVANCE.TIMER : GUIDE_ADVANCE.MANUAL
      }
      if (patch.autoActivateHotspotId === '') {
        patch.autoActivateActionId = ''
      }
      if ((step.inspectionCommand?.animationClip || step.inspectionCommand?.variantId) &&
        (patch.autoActivateHotspotId === '' || (patch.highlightHotspotId === '' && !guideProductTarget({ ...step, ...patch }, scenesById.get(step.sceneId))))) {
        patch.inspectionCommand = { animationClip: '', variantId: '' }
      }
      return { ...step, ...patch }
    }),
  }))
}

// Keep removal and reference cleanup in one history entry so Undo restores both.
export function removeProjectGuide(project, guideId) {
  if (!project.guides?.some(guide => guide.id === guideId)) return project
  const scenes = project.scenes.map(scene => ({ ...scene, hotspots: (scene.hotspots || []).flatMap(hotspot => {
    const original = normalizeHotspotActions(hotspot)
    const actions = original.filter(action => action.type !== ACTION_TYPES.START_GUIDE || action.guideId !== guideId)
    if (actions.length === original.length) return [hotspot]
    return actions.length ? [withHotspotActions(hotspot, actions)] : []
  }) }))
  const settings = { ...project.settings }
  if (settings.defaultGuideId === guideId) delete settings.defaultGuideId
  return { ...project, scenes, settings, guides: clearMissingHotspots(project.guides.filter(guide => guide.id !== guideId), scenes) }
}

export function removeProjectScene(project, sceneId) {
  if (project.scenes.length <= 1 || !project.scenes.some((scene) => scene.id === sceneId)) return project
  const scenes = project.scenes.filter((scene) => scene.id !== sceneId).map((scene) => ({
    ...scene,
    hotspots: (scene.hotspots || []).flatMap((hotspot) => {
      const original = normalizeHotspotActions(hotspot)
      const actions = original.filter((action) => action.type !== ACTION_TYPES.NAVIGATE_SCENE || action.sceneId !== sceneId)
      if (actions.length === original.length) return [hotspot]
      if (!actions.length) return []
      return [{ ...hotspot, actions, targetSceneId: actions.find((action) => action.type === ACTION_TYPES.NAVIGATE_SCENE)?.sceneId || '' }]
    }),
  }))
  return {
    ...project, scenes,
    startSceneId: project.startSceneId === sceneId ? scenes[0].id : project.startSceneId,
    guides: clearMissingHotspots(project.guides || [], scenes),
  }
}

export function removeProjectHotspot(project, sceneId, hotspotId) {
  const scenes = project.scenes.map((scene) => scene.id === sceneId ? {
    ...scene, hotspots: (scene.hotspots || []).filter((hotspot) => hotspot.id !== hotspotId),
  } : scene)
  return { ...project, scenes, guides: clearMissingHotspots(project.guides || [], scenes) }
}

export function replaceSpatialRoom(project, sceneId, { spatial, hotspots: imported = [] }) {
  const scenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene
    const incoming = new Map(imported.map((hotspot) => [hotspot.id, hotspot]))
    const hotspots = (scene.hotspots || []).flatMap((hotspot) => {
      const replacement = incoming.get(hotspot.id)
      if (replacement) {
        incoming.delete(hotspot.id)
        const actions = normalizeHotspotActions(hotspot)
        return [withHotspotActions({ ...replacement, ...hotspot, spatialPosition: replacement.spatialPosition },
          actions.length ? actions : normalizeHotspotActions(replacement))]
      }
      const actions = normalizeHotspotActions(hotspot)
      const panoramaActions = actions.filter((action) => action.type !== ACTION_TYPES.PLAY_ROOM_ANIMATION)
      const { spatialPosition, ...panoramaHotspot } = hotspot
      if (!spatialPosition && panoramaActions.length === actions.length) return [hotspot]
      return panoramaActions.length ? [withHotspotActions(panoramaHotspot, panoramaActions)] : []
    })
    return { ...scene, spatial, hotspots: [...hotspots, ...incoming.values()] }
  })
  return { ...project, scenes, guides: clearMissingHotspots(project.guides || [], scenes) }
}
