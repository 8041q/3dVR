import Select from '../ui/Select'
import React, { useEffect, useId, useState } from 'react'
import { ACTION_CHOICES, ACTION_TYPES, createAction, isPanoramaFallback, isRoomFallbackPair, normalizeHotspotActions, withHotspotActions } from '../../actions/actionTypes'

function labelForType(type) {
  return ACTION_CHOICES.find((choice) => choice.type === type)?.label || 'Unsupported action'
}

function summaryForAction(action, scenes, guides) {
  if (!action) return ''

  if (action.type === ACTION_TYPES.NAVIGATE_SCENE) {
    const scene = scenes.find((item) => item.id === action.sceneId)
    return scene?.title || 'Choose destination'
  }

  if (action.type === ACTION_TYPES.PLAY_ROOM_ANIMATION) {
    return action.clip || 'Choose room animation'
  }

  if (action.type === ACTION_TYPES.INSPECT_MODEL) {
    return action.modelUrl ? action.title || '3D model' : 'Choose a GLB model'
  }

  if (action.type === ACTION_TYPES.SHOW_INFO) {
    return action.title || 'Information panel'
  }

  if (action.type === ACTION_TYPES.START_GUIDE) {
    const guide = guides.find((item) => item.id === action.guideId)
    return guide?.title || 'Choose guide'
  }

  if (action.type === ACTION_TYPES.OPEN_URL) {
    return action.url || 'Add URL'
  }

  return ''
}

function moveAction(actions, fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || toIndex >= actions.length || fromIndex === toIndex) return actions
  const next = [...actions]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

export default function HotspotActionEditor({
  hotspot,
  scenes,
  guides = [],
  currentSceneId,
  onUpdate,
  onEditActions,
  onEditProduct,
  selectionRequest,
}) {
  const actions = normalizeHotspotActions(hotspot)
  const currentScene = scenes.find((scene) => scene.id === currentSceneId)
  const roomAnimations = Array.isArray(currentScene?.spatial?.animations) ? currentScene.spatial.animations : []
  const readyGuides = guides.filter((guide) => guide.steps?.length)
  const [selectedActionId, setSelectedActionId] = useState(selectionRequest?.actionId || '')
  const [newActionType, setNewActionType] = useState('')
  const [addingAction, setAddingAction] = useState(false)
  const addActionId = useId()
  const selectedIndex = Math.max(0, actions.findIndex((action) => action.id === selectedActionId))
  const selectedAction = actions[selectedIndex]
  const fallbackPair = isRoomFallbackPair(actions)
  const addingFallback = actions.length === 1 && actions[0].type === ACTION_TYPES.PLAY_ROOM_ANIMATION
  const fallbackSelected = fallbackPair && selectedIndex === 1
  const choices = ACTION_CHOICES.filter(({ type }) => {
    if (type === ACTION_TYPES.NAVIGATE_SCENE) return scenes.some((scene) => scene.id !== currentSceneId)
    if (type === ACTION_TYPES.START_GUIDE) return readyGuides.length > 0
    if (type === ACTION_TYPES.PLAY_ROOM_ANIMATION) return Boolean(currentScene?.spatial?.roomUrl && Array.isArray(hotspot.spatialPosition))
    return true
  })
  const addChoices = addingFallback ? choices.filter(({ type }) => isPanoramaFallback(type)) : choices
  const typeChoices = fallbackSelected ? choices.filter(({ type }) => isPanoramaFallback(type)) : choices

  useEffect(() => {
    if (selectionRequest?.actionId) setSelectedActionId(selectionRequest.actionId)
  }, [selectionRequest])

  function editActions(update) {
    if (onEditActions) return onEditActions(update)
    return onUpdate(withHotspotActions(hotspot, update(actions)))
  }

  function patchAction(patch) {
    // An upload may finish after the action was moved, deleted or replaced.
    editActions((current) => current.map((action) => {
      if (action.id !== selectedAction.id || action.type !== selectedAction.type) return action
      const change = typeof patch === 'function' ? patch(action) : patch
      return change ? { ...action, ...change } : action
    }))
  }

  function addAction() {
    if (!newActionType) return
    const action = createAction(newActionType)
    editActions((current) => !current.length || (current.length === 1
      && current[0].type === ACTION_TYPES.PLAY_ROOM_ANIMATION && isPanoramaFallback(action.type))
      ? [...current, action] : current)
    setSelectedActionId(action.id)
    setNewActionType('')
    setAddingAction(false)
  }

  function reorderAction(delta) {
    editActions((current) => {
      const index = current.findIndex((action) => action.id === selectedAction.id)
      return moveAction(current, index, index + delta)
    })
  }

  const addActionFields = (
    <>
      <label>
        {addingFallback ? 'Panorama fallback' : 'What should this hotspot do?'}
        <Select value={newActionType} onChange={(event) => setNewActionType(event.target.value)}>
          <option value="">Choose an action</option>
          {addChoices.map((choice) => (
            <option key={choice.type} value={choice.type}>{choice.label}</option>
          ))}
        </Select>
      </label>
      <button type="button" onClick={addAction} disabled={!newActionType}>
        {addingFallback ? 'Add fallback' : 'Set action'}
      </button>
    </>
  )

  return (
    <div className="action-editor action-editor--builder">
      {!selectedAction && <div>{addActionFields}</div>}
      {actions.length > 1 && (
        <label>
          {fallbackPair ? 'Room action and fallback' : 'Existing actions in run order'}
          <Select value={selectedAction.id} onChange={(event) => setSelectedActionId(event.target.value)}>
            {actions.map((action, index) => (
              <option key={action.id} value={action.id}>
                {fallbackPair ? (index === 0 ? 'Tracked VR' : 'Panorama fallback') : index + 1}. {labelForType(action.type)} · {summaryForAction(action, scenes, guides)}
              </option>
            ))}
          </Select>
        </label>
      )}
      {actions.length > 1 && !fallbackPair && <p className="muted">This hotspot runs several actions. For a clear visitor outcome, use one action per hotspot.</p>}

      {selectedAction && (
        <div className="action-inspector" key={selectedAction.id}>
          <label>
            {fallbackSelected ? 'Fallback action' : 'What should it do?'}
            <Select
              value={selectedAction.type}
              disabled={fallbackPair && !fallbackSelected}
              onChange={(event) => {
                const replacement = createAction(event.target.value)
                editActions((current) => current.map((action) => action.id === selectedAction.id ? replacement : action))
                setSelectedActionId(replacement.id)
              }}
            >
              {!typeChoices.some((choice) => choice.type === selectedAction.type) && (
                <option value={selectedAction.type}>{labelForType(selectedAction.type)}</option>
              )}
              {typeChoices.map((choice) => <option key={choice.type} value={choice.type}>{choice.label}</option>)}
            </Select>
          </label>

          {selectedAction.type === ACTION_TYPES.NAVIGATE_SCENE && (
            <label>
              Destination scene
              <Select
                value={selectedAction.sceneId || ''}
                onChange={(event) => patchAction({ sceneId: event.target.value })}
              >
                <option value="">Choose a scene</option>
                {scenes
                  .filter((scene) => scene.id !== currentSceneId || scene.id === selectedAction.sceneId)
                  .map((scene) => (
                    <option key={scene.id} value={scene.id}>{scene.title || scene.id}</option>
                  ))}
              </Select>
              {!scenes.some((scene) => scene.id !== currentSceneId) && (
                <span className="muted">Add another scene to link to it.</span>
              )}
            </label>
          )}

          {selectedAction.type === ACTION_TYPES.PLAY_ROOM_ANIMATION && (
            <>
              <p className="muted">Plays in the active 3D room. Add a fallback if this hotspot should also work in the panorama.</p>
              {!Array.isArray(hotspot.spatialPosition) && <p className="editor-warning">This hotspot has no position in the imported room.</p>}
              <label>
                Room animation
                {roomAnimations.length > 0 ? (
                  <Select
                    value={selectedAction.clip || ''}
                    onChange={(event) => patchAction({ clip: event.target.value })}
                  >
                    <option value="">Choose an animation</option>
                    {selectedAction.clip && !roomAnimations.includes(selectedAction.clip) && (
                      <option value={selectedAction.clip}>{selectedAction.clip} (missing)</option>
                    )}
                    {roomAnimations.map((clip) => <option key={clip} value={clip}>{clip}</option>)}
                  </Select>
                ) : (
                  <input
                    value={selectedAction.clip || ''}
                    onChange={(event) => patchAction({ clip: event.target.value })}
                    placeholder="Animation clip name from Blender"
                  />
                )}
              </label>
              <label>
                When selected
                <Select
                  value={selectedAction.behavior || 'toggle'}
                  onChange={(event) => patchAction({ behavior: event.target.value })}
                >
                  <option value="toggle">Toggle play / pause</option>
                  <option value="restart">Restart from beginning</option>
                  <option value="play">Play / resume</option>
                </Select>
              </label>
              <div className="editor-grid-2">
                <label>
                  Loop
                  <Select
                    value={selectedAction.loop || 'once'}
                    onChange={(event) => patchAction({ loop: event.target.value })}
                  >
                    <option value="once">Once</option>
                    <option value="repeat">Repeat</option>
                  </Select>
                </label>
                <label>
                  Speed
                  <input
                    type="number"
                    min="0.1"
                    max="4"
                    step="0.1"
                    value={selectedAction.speed ?? 1}
                    onChange={(event) => patchAction({ speed: Number(event.target.value) || 1 })}
                  />
                </label>
              </div>
              {roomAnimations.length === 0 && currentScene?.spatial?.roomUrl && (
                <div className="muted">Import a Blender room export with animation metadata to choose from a list.</div>
              )}
            </>
          )}

          {selectedAction.type === ACTION_TYPES.INSPECT_MODEL && (
            <>
              <p className="muted">{selectedAction.modelUrl ? `${selectedAction.title || '3D product'} · Model attached` : 'No model attached'}</p>
              <button type="button" onClick={() => onEditProduct(selectedAction.id)}>Edit product</button>
            </>
          )}

          {selectedAction.type === ACTION_TYPES.SHOW_INFO && (
            <>
              <label>
                Title
                <input
                  value={selectedAction.title || ''}
                  onChange={(event) => patchAction({ title: event.target.value })}
                />
              </label>
              <label>
                Text
                <textarea
                  value={selectedAction.body || ''}
                  onChange={(event) => patchAction({ body: event.target.value })}
                  rows="5"
                />
              </label>
            </>
          )}

          {selectedAction.type === ACTION_TYPES.OPEN_URL && (
            <>
              <label>
                URL
                <input
                  type="url"
                  value={selectedAction.url || ''}
                  onChange={(event) => patchAction({ url: event.target.value })}
                  placeholder="https://example.com"
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={selectedAction.newTab !== false}
                  onChange={(event) => patchAction({ newTab: event.target.checked })}
                />
                Open in a new tab
              </label>
            </>
          )}

          {selectedAction.type === ACTION_TYPES.START_GUIDE && (
            <label>
              Guide
              <Select
                value={selectedAction.guideId || ''}
                onChange={(event) => patchAction({ guideId: event.target.value })}
              >
                <option value="">Choose a guide</option>
                {guides.map((guide) => (
                  <option key={guide.id} value={guide.id} disabled={!guide.steps?.length}>
                    {guide.title || guide.id}{!guide.steps?.length && ' (no steps)'}
                  </option>
                ))}
              </Select>
              {!readyGuides.length && <span className="muted">Create a guide with at least one step in Guides.</span>}
            </label>
          )}
        </div>
      )}

      {selectedAction && (
        <>
          <div className="button-row">
            {actions.length > 1 && !fallbackPair && <>
              <button type="button" disabled={selectedIndex === 0} onClick={() => reorderAction(-1)}>Move earlier</button>
              <button type="button" disabled={selectedIndex === actions.length - 1} onClick={() => reorderAction(1)}>Move later</button>
            </>}
            {actions.length > 1 && <button type="button" className="danger" onClick={() => {
              editActions((current) => current.filter((action) => action.id !== selectedAction.id))
              setSelectedActionId(actions[selectedIndex + 1]?.id || actions[selectedIndex - 1]?.id || '')
            }}>{fallbackSelected ? 'Remove fallback' : 'Remove action'}</button>}
            {addingFallback && <button type="button" aria-expanded={addingAction} aria-controls={addActionId}
              onClick={() => { setAddingAction(!addingAction); setNewActionType('') }}>
              {addingAction ? 'Cancel' : 'Add panorama fallback'}
            </button>}
          </div>
          <div id={addActionId} hidden={!addingAction}>{addActionFields}</div>
        </>
      )}
    </div>
  )
}
