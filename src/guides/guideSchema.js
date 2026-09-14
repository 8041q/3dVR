function id(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createGuide() {
  return {
    id: id('guide'),
    title: 'New guide',
    description: '',
    steps: [],
  }
}

export function createGuideStep(sceneId = '') {
  return {
    id: id('guide-step'),
    title: 'New step',
    sceneId,
    instruction: '',
    focus: null,
    highlightHotspotId: '',
    advanceOnHotspotId: '',
    autoActivateHotspotId: '',
    narrationUrl: '',
    autoAdvanceMs: 0,
    inspectionCommand: {
      animationClip: '',
      variantId: '',
    },
  }
}

export function normalizeGuide(guide) {
  return {
    ...guide,
    steps: Array.isArray(guide?.steps) ? guide.steps : [],
  }
}
