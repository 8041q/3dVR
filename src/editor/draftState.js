import { PROJECT_METADATA_LIMITS } from '../projectMetadata.js'

const HISTORY_LIMIT = 60

export function draftContent(project) {
  return {
    title: project.title,
    metadata: Object.fromEntries(Object.keys(PROJECT_METADATA_LIMITS)
      .filter((key) => typeof project.metadata?.[key] === 'string' && project.metadata[key] !== '')
      .map((key) => [key, project.metadata[key]])),
    startSceneId: project.startSceneId,
    scenes: project.scenes || [],
    guides: project.guides || [],
  }
}

export function contentSignature(project) {
  return JSON.stringify(project ? draftContent(project) : null)
}

export function mergeSavedDraft(current, submitted, saved) {
  const project = current === submitted ? saved : { ...current, meta: saved.meta }
  return { project, dirty: contentSignature(project) !== contentSignature(saved) }
}

export function createDraftState(project = null) {
  return {
    project,
    savedSignature: contentSignature(project),
    dirty: false,
    past: [],
    future: [],
  }
}

export function editDraft(state, updater) {
  if (!state.project) return state
  const next = typeof updater === 'function' ? updater(state.project) : updater
  if (next === state.project) return state
  const signature = contentSignature(next)
  if (signature === contentSignature(state.project)) return state

  return {
    ...state,
    project: next,
    dirty: signature !== state.savedSignature,
    past: [...state.past.slice(1 - HISTORY_LIMIT), state.project],
    future: [],
  }
}

export function moveDraftHistory(state, direction) {
  const undoing = direction === 'undo'
  const source = undoing ? state.past : state.future
  if (!source.length) return state

  const project = { ...source.at(-1), meta: state.project.meta }
  return {
    ...state,
    project,
    dirty: contentSignature(project) !== state.savedSignature,
    past: undoing ? source.slice(0, -1) : [...state.past, state.project],
    future: undoing ? [...state.future, state.project] : source.slice(0, -1),
  }
}

export function receiveSavedDraft(state, submitted, saved) {
  return {
    ...state,
    ...mergeSavedDraft(state.project, submitted, saved),
    savedSignature: contentSignature(saved),
  }
}
