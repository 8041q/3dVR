export function resolveSceneId(scenes, selectedId, startSceneId) {
  if (selectedId && scenes.some((scene) => scene.id === selectedId)) return selectedId
  if (startSceneId && scenes.some((scene) => scene.id === startSceneId)) return startSceneId
  return scenes[0]?.id || null
}
