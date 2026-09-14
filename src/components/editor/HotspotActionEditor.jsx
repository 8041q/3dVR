import React from 'react'
import { ACTION_TYPES, createAction, normalizeHotspotActions } from '../../actions/actionTypes'
import ModelAuthoringEditor from './ModelAuthoringEditor'

const ACTION_LABELS = {
  [ACTION_TYPES.NAVIGATE_SCENE]: 'Navigate to scene',
  [ACTION_TYPES.INSPECT_MODEL]: 'Inspect 3D model',
  [ACTION_TYPES.SHOW_INFO]: 'Show information',
  [ACTION_TYPES.OPEN_URL]: 'Open link',
  [ACTION_TYPES.START_GUIDE]: 'Start guide',
}

function replaceAction(actions, index, nextAction) {
  return actions.map((action, actionIndex) => actionIndex === index ? nextAction : action)
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

  return (
    <div className="action-editor">
      <div className="action-editor__heading">
        <strong>Actions</strong>
        <button
          type="button"
          onClick={() => updateActions([...actions, createAction(ACTION_TYPES.NAVIGATE_SCENE)])}
        >
          Add action
        </button>
      </div>

      {actions.length === 0 && (
        <div className="muted">This hotspot has no action yet.</div>
      )}

      {actions.map((action, index) => (
        <div className="action-card" key={action.id || `${action.type}-${index}`}>
          <div className="action-card__topline">
            <span>Action {index + 1}</span>
            <button
              type="button"
              className="danger"
              onClick={() => updateActions(actions.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove
            </button>
          </div>

          <label>
            Type
            <select
              value={action.type}
              onChange={(event) => {
                const fresh = createAction(event.target.value)
                fresh.id = action.id || fresh.id
                updateActions(replaceAction(actions, index, fresh))
              }}
            >
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          {action.type === ACTION_TYPES.NAVIGATE_SCENE && (
            <label>
              Target scene
              <select
                value={action.sceneId || ''}
                onChange={(event) => patchAction(index, { sceneId: event.target.value })}
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

          {action.type === ACTION_TYPES.INSPECT_MODEL && (
            <ModelAuthoringEditor
              action={action}
              uploadAsset={uploadAsset}
              patchAction={(patch) => patchAction(index, patch)}
            />
          )}

          {action.type === ACTION_TYPES.SHOW_INFO && (
            <>
              <label>
                Title
                <input
                  value={action.title || ''}
                  onChange={(event) => patchAction(index, { title: event.target.value })}
                />
              </label>
              <label>
                Text
                <textarea
                  value={action.body || ''}
                  onChange={(event) => patchAction(index, { body: event.target.value })}
                  rows="5"
                />
              </label>
            </>
          )}

          {action.type === ACTION_TYPES.OPEN_URL && (
            <>
              <label>
                URL
                <input
                  type="url"
                  value={action.url || ''}
                  onChange={(event) => patchAction(index, { url: event.target.value })}
                  placeholder="https://example.com"
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={action.newTab !== false}
                  onChange={(event) => patchAction(index, { newTab: event.target.checked })}
                />
                Open in a new tab
              </label>
            </>
          )}

          {action.type === ACTION_TYPES.START_GUIDE && (
            <label>
              Guide
              <select
                value={action.guideId || ''}
                onChange={(event) => patchAction(index, { guideId: event.target.value })}
              >
                <option value="">Choose a guide</option>
                {guides.map((guide) => (
                  <option key={guide.id} value={guide.id}>{guide.title || guide.id}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      ))}
    </div>
  )
}
