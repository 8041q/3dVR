import React, { useEffect, useMemo, useState } from 'react'
import { ACTION_TYPES, createAction, normalizeHotspotActions } from '../../actions/actionTypes'
import ModelAuthoringEditor from './ModelAuthoringEditor'

const ACTION_CHOICES = [
  {
    type: ACTION_TYPES.NAVIGATE_SCENE,
    label: 'Go to scene',
    description: 'Move the visitor into another 360 scene.',
  },
  {
    type: ACTION_TYPES.PLAY_ROOM_ANIMATION,
    label: 'Play room movement',
    description: 'Run an animation already contained in the Blender spatial room.',
  },
  {
    type: ACTION_TYPES.INSPECT_MODEL,
    label: 'Inspect product (separate GLB)',
    description: 'Legacy/fallback action for a standalone GLB outside the spatial room.',
  },
  {
    type: ACTION_TYPES.SHOW_INFO,
    label: 'Show information',
    description: 'Display a short title and explanation.',
  },
  {
    type: ACTION_TYPES.START_GUIDE,
    label: 'Start guide',
    description: 'Begin one of the guided visitor experiences.',
  },
  {
    type: ACTION_TYPES.OPEN_URL,
    label: 'Open link',
    description: 'Open a website or other web resource.',
  },
]

function labelForType(type) {
  return ACTION_CHOICES.find((choice) => choice.type === type)?.label || 'Action'
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
    return action.title || (action.modelUrl ? 'Separate 3D model' : 'Choose a GLB model')
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

function replaceAction(actions, index, nextAction) {
  return actions.map((action, actionIndex) => actionIndex === index ? nextAction : action)
}

function moveAction(actions, fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= actions.length || fromIndex === toIndex) return actions
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
  uploadAsset,
  onUpdate,
}) {
  const actions = normalizeHotspotActions(hotspot)
  const currentScene = scenes.find((scene) => scene.id === currentSceneId)
  const roomAnimations = Array.isArray(currentScene?.spatial?.animations) ? currentScene.spatial.animations : []
  const [selectedActionId, setSelectedActionId] = useState(actions[0]?.id || '')
  const [showAddPicker, setShowAddPicker] = useState(false)

  useEffect(() => {
    if (actions.length === 0) {
      setSelectedActionId('')
      return
    }

    if (!actions.some((action) => action.id === selectedActionId)) {
      setSelectedActionId(actions[0].id)
    }
  }, [actions, selectedActionId])

  const selectedIndex = useMemo(
    () => actions.findIndex((action) => action.id === selectedActionId),
    [actions, selectedActionId],
  )
  const selectedAction = selectedIndex >= 0 ? actions[selectedIndex] : null

  function updateActions(nextActions) {
    const navigation = nextActions.find((action) => action.type === ACTION_TYPES.NAVIGATE_SCENE)
    onUpdate({
      ...hotspot,
      actions: nextActions,
      targetSceneId: navigation?.sceneId || '',
    })
  }

  function patchAction(index, patch) {
    updateActions(replaceAction(actions, index, { ...actions[index], ...patch }))
  }

  function addAction(type) {
    const action = createAction(type)
    updateActions([...actions, action])
    setSelectedActionId(action.id)
    setShowAddPicker(false)
  }

  function removeAction(index) {
    const next = actions.filter((_, itemIndex) => itemIndex !== index)
    updateActions(next)
    const nextSelected = next[Math.min(index, next.length - 1)]
    setSelectedActionId(nextSelected?.id || '')
  }

  return (
    <div className="action-editor action-editor--builder">
      <div className="action-editor__heading">
        <div>
          <strong>What happens when selected</strong>
          <div className="muted">Actions run from top to bottom. Select one card to edit it.</div>
        </div>
        <button type="button" onClick={() => setShowAddPicker((value) => !value)}>
          Add action
        </button>
      </div>

      {showAddPicker && (
        <div className="action-picker">
          {ACTION_CHOICES.map((choice) => (
            <button type="button" key={choice.type} onClick={() => addAction(choice.type)}>
              <strong>{choice.label}</strong>
              <span>{choice.description}</span>
            </button>
          ))}
        </div>
      )}

      {actions.length === 0 && (
        <div className="editor-empty-state">
          This hotspot does nothing yet. Add the first action visitors should trigger.
        </div>
      )}

      <div className="action-sequence">
        {actions.map((action, index) => (
          <article
            key={action.id || `${action.type}-${index}`}
            className={`action-sequence-card${action.id === selectedActionId ? ' active' : ''}`}
          >
            <button
              type="button"
              className="action-sequence-card__select"
              onClick={() => setSelectedActionId(action.id)}
            >
              <span className="action-sequence-card__number">{index + 1}</span>
              <span className="action-sequence-card__text">
                <strong>{labelForType(action.type)}</strong>
                <small>{summaryForAction(action, scenes, guides)}</small>
              </span>
            </button>
            <div className="action-sequence-card__controls">
              <button
                type="button"
                title="Move earlier"
                disabled={index === 0}
                onClick={() => updateActions(moveAction(actions, index, index - 1))}
              >
                Earlier
              </button>
              <button
                type="button"
                title="Move later"
                disabled={index === actions.length - 1}
                onClick={() => updateActions(moveAction(actions, index, index + 1))}
              >
                Later
              </button>
            </div>
          </article>
        ))}
      </div>

      {selectedAction && (
        <div className="action-inspector">
          <div className="action-inspector__header">
            <div>
              <div className="editor-eyebrow">Action {selectedIndex + 1}</div>
              <strong>{labelForType(selectedAction.type)}</strong>
            </div>
            <button type="button" className="danger" onClick={() => removeAction(selectedIndex)}>
              Remove
            </button>
          </div>

          <label>
            Action type
            <select
              value={selectedAction.type}
              onChange={(event) => {
                const fresh = createAction(event.target.value)
                fresh.id = selectedAction.id || fresh.id
                updateActions(replaceAction(actions, selectedIndex, fresh))
              }}
            >
              {ACTION_CHOICES.map((choice) => (
                <option key={choice.type} value={choice.type}>{choice.label}</option>
              ))}
            </select>
          </label>

          {selectedAction.type === ACTION_TYPES.NAVIGATE_SCENE && (
            <label>
              Destination scene
              <select
                value={selectedAction.sceneId || ''}
                onChange={(event) => patchAction(selectedIndex, { sceneId: event.target.value })}
              >
                <option value="">Choose a scene</option>
                {scenes
                  .filter((scene) => scene.id !== currentSceneId)
                  .map((scene) => (
                    <option key={scene.id} value={scene.id}>{scene.title || scene.id}</option>
                  ))}
              </select>
            </label>
          )}

          {selectedAction.type === ACTION_TYPES.PLAY_ROOM_ANIMATION && (
            <>
              {!currentScene?.spatial?.roomUrl && (
                <div className="editor-warning">This action only runs when the Blender spatial room is active.</div>
              )}
              <label>
                Room animation
                {roomAnimations.length > 0 ? (
                  <select
                    value={selectedAction.clip || ''}
                    onChange={(event) => patchAction(selectedIndex, { clip: event.target.value })}
                  >
                    <option value="">Choose an animation</option>
                    {roomAnimations.map((clip) => <option key={clip} value={clip}>{clip}</option>)}
                  </select>
                ) : (
                  <input
                    value={selectedAction.clip || ''}
                    onChange={(event) => patchAction(selectedIndex, { clip: event.target.value })}
                    placeholder="Animation clip name from Blender"
                  />
                )}
              </label>
              <label>
                When selected
                <select
                  value={selectedAction.behavior || 'toggle'}
                  onChange={(event) => patchAction(selectedIndex, { behavior: event.target.value })}
                >
                  <option value="toggle">Toggle play / pause</option>
                  <option value="restart">Restart from beginning</option>
                  <option value="play">Play / resume</option>
                </select>
              </label>
              <div className="editor-grid-2">
                <label>
                  Loop
                  <select
                    value={selectedAction.loop || 'once'}
                    onChange={(event) => patchAction(selectedIndex, { loop: event.target.value })}
                  >
                    <option value="once">Once</option>
                    <option value="repeat">Repeat</option>
                  </select>
                </label>
                <label>
                  Speed
                  <input
                    type="number"
                    min="0.1"
                    max="4"
                    step="0.1"
                    value={selectedAction.speed ?? 1}
                    onChange={(event) => patchAction(selectedIndex, { speed: Number(event.target.value) || 1 })}
                  />
                </label>
              </div>
              {roomAnimations.length === 0 && currentScene?.spatial?.roomUrl && (
                <div className="muted">Re-export the Blender room with Phase 14 to expose its animation names automatically.</div>
              )}
            </>
          )}

          {selectedAction.type === ACTION_TYPES.INSPECT_MODEL && (
            <ModelAuthoringEditor
              action={selectedAction}
              uploadAsset={uploadAsset}
              patchAction={(patch) => patchAction(selectedIndex, patch)}
            />
          )}

          {selectedAction.type === ACTION_TYPES.SHOW_INFO && (
            <>
              <label>
                Title
                <input
                  value={selectedAction.title || ''}
                  onChange={(event) => patchAction(selectedIndex, { title: event.target.value })}
                />
              </label>
              <label>
                Text
                <textarea
                  value={selectedAction.body || ''}
                  onChange={(event) => patchAction(selectedIndex, { body: event.target.value })}
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
                  onChange={(event) => patchAction(selectedIndex, { url: event.target.value })}
                  placeholder="https://example.com"
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={selectedAction.newTab !== false}
                  onChange={(event) => patchAction(selectedIndex, { newTab: event.target.checked })}
                />
                Open in a new tab
              </label>
            </>
          )}

          {selectedAction.type === ACTION_TYPES.START_GUIDE && (
            <label>
              Guide
              <select
                value={selectedAction.guideId || ''}
                onChange={(event) => patchAction(selectedIndex, { guideId: event.target.value })}
              >
                <option value="">Choose a guide</option>
                {guides.map((guide) => (
                  <option key={guide.id} value={guide.id}>{guide.title || guide.id}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  )
}
