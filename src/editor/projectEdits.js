import { ACTION_TYPES, normalizeHotspotActions } from '../actions/actionTypes.js'

function clearMissingHotspots(guides, scenes) {
  const idsByScene = new Map(scenes.map((scene) => [scene.id, new Set((scene.hotspots || []).map((hotspot) => hotspot.id))]))
  const allIds = new Set([...idsByScene.values()].flatMap((ids) => [...ids]))
  return guides.map((guide) => ({
    ...guide,
    steps: (guide.steps || []).filter((step) => !step.sceneId || idsByScene.has(step.sceneId)).map((step) => {
      const patch = {}
      const ids = step.sceneId ? idsByScene.get(step.sceneId) : allIds
      for (const key of ['highlightHotspotId', 'advanceOnHotspotId', 'autoActivateHotspotId']) {
        if (step[key] && !ids.has(step[key])) patch[key] = ''
      }
      return { ...step, ...patch }
    }),
  }))
}

// Keep removal and reference cleanup in one history entry so Undo restores both.
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
