export function contentSignature(project) {
  return JSON.stringify({ title: project?.title, startSceneId: project?.startSceneId, scenes: project?.scenes, guides: project?.guides })
}

export function mergeSavedDraft(current, submitted, saved) {
  const project = current === submitted ? saved : { ...current, meta: saved.meta }
  return { project, dirty: contentSignature(project) !== contentSignature(saved) }
}
