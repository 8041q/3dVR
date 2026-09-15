const PREFIX = '3dvr-draft-preview:'
const MAX_AGE_MS = 2 * 60 * 60 * 1000

function makeKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createDraftPreview(project) {
  const key = makeKey()
  const record = {
    createdAt: Date.now(),
    project: {
      schemaVersion: project?.schemaVersion || 3,
      id: project?.id,
      title: project?.title,
      startSceneId: project?.startSceneId,
      scenes: project?.scenes || [],
      guides: project?.guides || [],
    },
  }
  localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(record))
  return key
}

export function readDraftPreview(key, expectedProjectId = '') {
  if (!key) return null

  try {
    const record = JSON.parse(localStorage.getItem(`${PREFIX}${key}`) || 'null')
    if (!record?.project) return null
    if (Date.now() - Number(record.createdAt || 0) > MAX_AGE_MS) {
      localStorage.removeItem(`${PREFIX}${key}`)
      return null
    }
    if (expectedProjectId && record.project.id !== expectedProjectId) return null
    return record.project
  } catch {
    return null
  }
}

export function cleanupDraftPreviews() {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(PREFIX)) continue
    try {
      const record = JSON.parse(localStorage.getItem(key) || 'null')
      if (!record?.createdAt || Date.now() - Number(record.createdAt) > MAX_AGE_MS) {
        localStorage.removeItem(key)
      }
    } catch {
      localStorage.removeItem(key)
    }
  }
}
