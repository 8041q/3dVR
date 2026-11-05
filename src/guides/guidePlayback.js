import { ACTION_TYPES, normalizeHotspotActions } from '../actions/actionTypes.js'

export const GUIDE_ADVANCE = Object.freeze({
  MANUAL: 'manual',
  HOTSPOT: 'hotspot',
  TIMER: 'timer',
  EITHER: 'hotspot-or-timer',
  LEGACY_BOTH: 'legacy-both',
})

export function guideAdvanceMode(step) {
  if ([GUIDE_ADVANCE.MANUAL, GUIDE_ADVANCE.HOTSPOT, GUIDE_ADVANCE.TIMER, GUIDE_ADVANCE.EITHER].includes(step?.advanceMode)) {
    return step.advanceMode
  }
  const timed = Number(step?.autoAdvanceMs) > 0
  if (step?.advanceOnHotspotId) return timed ? GUIDE_ADVANCE.LEGACY_BOTH : GUIDE_ADVANCE.HOTSPOT
  return timed ? GUIDE_ADVANCE.TIMER : GUIDE_ADVANCE.MANUAL
}

export function guideAdvanceHotspot(step) {
  const mode = guideAdvanceMode(step)
  return mode === GUIDE_ADVANCE.HOTSPOT || mode === GUIDE_ADVANCE.EITHER || mode === GUIDE_ADVANCE.LEGACY_BOTH
    ? step.advanceOnHotspotId || ''
    : ''
}

export function guideAdvanceDelay(step) {
  const mode = guideAdvanceMode(step)
  const delay = Number(step?.autoAdvanceMs)
  return (mode === GUIDE_ADVANCE.TIMER || mode === GUIDE_ADVANCE.EITHER || mode === GUIDE_ADVANCE.LEGACY_BOTH) && delay > 0 && delay <= 2_147_483_647
    ? delay
    : 0
}

export function guideEntryChoices(scene) {
  return (scene?.hotspots || []).flatMap((hotspot) => normalizeHotspotActions(hotspot)
    .filter((action) => action.type === ACTION_TYPES.SHOW_INFO || action.type === ACTION_TYPES.INSPECT_MODEL)
    .map((action) => ({ hotspot, action })))
}

export function guideEntryAction(step, scene) {
  if (!step?.sceneId || step.sceneId !== scene?.id || !step.autoActivateHotspotId) return null
  const choices = guideEntryChoices(scene).filter(({ hotspot }) => hotspot.id === step.autoActivateHotspotId)
  if (step.autoActivateActionId) {
    return choices.find(({ action }) => action.id === step.autoActivateActionId)?.action || null
  }
  return choices.length === 1 ? choices[0].action : null
}

export function guideProductTarget(step, scene) {
  const entry = guideEntryAction(step, scene)
  if (entry?.type === ACTION_TYPES.INSPECT_MODEL) {
    return { hotspotId: step.autoActivateHotspotId, action: entry, autoOpen: true }
  }
  if (!step?.sceneId || step.sceneId !== scene?.id || step.autoActivateActionId || !step.highlightHotspotId) return null

  // Older guides could ask visitors to open the highlighted product manually.
  const choices = guideEntryChoices(scene).filter(({ hotspot, action }) =>
    hotspot.id === step.highlightHotspotId && action.type === ACTION_TYPES.INSPECT_MODEL)
  return choices.length === 1
    ? { hotspotId: choices[0].hotspot.id, action: choices[0].action, autoOpen: false }
    : null
}

export function guideStepTargetIssues(step, scene) {
  const issues = []
  const add = (field, message, severity = 'error') => issues.push({ field, message, severity })
  const hasHotspot = (id) => scene?.hotspots?.some((hotspot) => hotspot.id === id)
  const explicitScene = Boolean(step.sceneId)

  if (explicitScene && step.highlightHotspotId && !hasHotspot(step.highlightHotspotId)) {
    add('highlightHotspotId', 'Choose a highlight in this step’s scene.')
  }

  const advanceMode = guideAdvanceMode(step)
  const trigger = guideAdvanceHotspot(step)
  if ((advanceMode === GUIDE_ADVANCE.HOTSPOT || advanceMode === GUIDE_ADVANCE.EITHER) && !trigger) {
    add('advanceOnHotspotId', 'Choose a scene and a hotspot to advance this step.')
  } else if (trigger && !explicitScene) {
    add('advanceOnHotspotId', 'Choose a scene before using a hotspot to advance.', step.advanceMode ? 'error' : 'warning')
  } else if (trigger && !hasHotspot(trigger)) {
    add('advanceOnHotspotId', 'Choose a hotspot in this step’s scene to advance.')
  }
  if ((advanceMode === GUIDE_ADVANCE.TIMER || advanceMode === GUIDE_ADVANCE.EITHER) && !guideAdvanceDelay(step)) {
    add('autoAdvanceMs', 'Set a valid advance time greater than zero.')
  }
  if (step.autoActivateActionId || step.autoActivateHotspotId) {
    const entry = guideEntryAction(step, scene)
    if (!entry) {
      add('autoActivateHotspotId', 'Choose a product or information action in this step’s scene to open automatically.',
        step.autoActivateActionId ? 'error' : 'warning')
    } else if (!step.autoActivateActionId) {
      const hotspot = scene.hotspots.find((item) => item.id === step.autoActivateHotspotId)
      if (normalizeHotspotActions(hotspot).length > 1) {
        add('autoActivateHotspotId', 'This saved auto-open runs only the product or information action. Choose an action explicitly to confirm.', 'warning')
      }
    }
  }

  const command = step.inspectionCommand
  if (command?.animationClip || command?.variantId) {
    const target = guideProductTarget(step, scene)
    const severity = step.autoActivateActionId ? 'error' : 'warning'
    if (!target) {
      add('inspectionCommand', 'Choose which product this step should open before adding a product command.', severity)
    } else {
      if (command.animationClip && !(target.action.animationControls || []).some((item) => item.clip === command.animationClip)) {
        // A legacy command may name a real GLB clip that is not mapped to a visitor control.
        add('inspectionCommand', 'Review the saved product animation or choose one configured for this product.', severity)
      }
      if (command.variantId && !(target.action.materialVariants || []).some((item) => item.id === command.variantId)) {
        add('inspectionCommand', 'Choose an existing finish for this product.', severity)
      }
    }
  }
  return issues
}

export function guideEntryKey(playback) {
  return playback ? `${playback.instanceId}:${playback.entry}` : ''
}

export function moveGuidePlayback(current, expectedEntry, stepCount, direction) {
  if (!current || guideEntryKey(current) !== expectedEntry) return current
  const stepIndex = current.stepIndex + direction
  if (stepIndex < 0) return current
  if (stepIndex >= stepCount) return null
  return { ...current, stepIndex, entry: current.entry + 1 }
}
