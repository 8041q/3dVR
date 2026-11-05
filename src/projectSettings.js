export const PROJECT_SETTINGS_DEFAULTS = {
  defaultGuideId: '',
  showGuideMenu: true,
  openLinksInNewTab: false,
  allowOffline: true,
}

// Store only overrides so adding settings does not change legacy revisions.
export function normalizeProjectSettings(value) {
  const source = value && typeof value === 'object' ? value : {}
  const result = {}
  if (typeof source.defaultGuideId === 'string' && source.defaultGuideId.trim()) {
    result.defaultGuideId = source.defaultGuideId.trim().slice(0, 200)
  }
  for (const key of ['showGuideMenu', 'openLinksInNewTab', 'allowOffline']) {
    if (typeof source[key] === 'boolean' && source[key] !== PROJECT_SETTINGS_DEFAULTS[key]) result[key] = source[key]
  }
  return result
}

export function projectViewerSettings(project) {
  const settings = { ...PROJECT_SETTINGS_DEFAULTS, ...normalizeProjectSettings(project?.settings) }
  if (!project?.guides?.some((guide) => guide.id === settings.defaultGuideId && guide.steps?.length)) settings.defaultGuideId = ''
  return settings
}
