import Select from '../ui/Select'
import React, { useState } from 'react'
import { ACTION_CHOICES, ACTION_TYPES } from '../../actions/actionTypes'
import HotspotActionEditor from './HotspotActionEditor'
import HotspotStyleEditor from './HotspotStyleEditor'

export function NewHotspot({ scene, scenes, guides, placement, onPlace, onCancelPlacement }) {
  const destinations = scenes.filter((item) => item.id !== scene.id)
  const [type, setType] = useState(destinations.length ? ACTION_TYPES.NAVIGATE_SCENE : ACTION_TYPES.SHOW_INFO)
  const [destination, setDestination] = useState(destinations[0]?.id || '')
  const choices = ACTION_CHOICES.filter((choice) => {
    if (choice.type === ACTION_TYPES.NAVIGATE_SCENE) return destinations.length > 0
    if (choice.type === ACTION_TYPES.START_GUIDE) return guides.some((guide) => guide.steps?.length)
    // Room animations need a spatial marker imported with the Blender room.
    if (choice.type === ACTION_TYPES.PLAY_ROOM_ANIMATION) return false
    return true
  })
  const selected = choices.find((choice) => choice.type === type) || choices[0]
  const navigation = selected.type === ACTION_TYPES.NAVIGATE_SCENE
  const validDestination = destinations.some((item) => item.id === destination)

  return (
    <section className="studio-section">
      <label>
        What should it do?
        <Select value={selected.type} disabled={Boolean(placement)} onChange={(event) => setType(event.target.value)}>
          {choices.map((choice) => <option key={choice.type} value={choice.type}>{choice.label}</option>)}
        </Select>
      </label>
      {navigation && (
        <label>
          Destination scene
          <Select value={validDestination ? destination : ''} disabled={Boolean(placement)} onChange={(event) => setDestination(event.target.value)}>
            <option value="">Choose a scene</option>
            {destinations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </Select>
        </label>
      )}
      {placement ? (
        <button onClick={onCancelPlacement}>Cancel placement</button>
      ) : (
        <button className="primary" disabled={navigation && !validDestination} onClick={() => onPlace({ type: selected.type, destination })}>
          Place on panorama
        </button>
      )}
      <p>Drag the panorama to look around. Click where the hotspot should appear.</p>
    </section>
  )
}

export default function HotspotInspector({
  hotspot, scene, scenes, guides, patchHotspot, onEditActions, onMove, onFind,
  onDelete, onEditProduct, selectionRequest,
}) {
  return (
    <>
      <section className="studio-section">
        <label>
          Hotspot name
          <input value={hotspot.label || ''} onChange={(event) => patchHotspot({ label: event.target.value })} />
        </label>
        <div className="button-row">
          <button onClick={onMove} disabled={!onMove}>Move hotspot</button>
          <button onClick={onFind}>Center in view</button>
        </div>
        {Array.isArray(hotspot.spatialPosition) && <p>Moving here edits the panorama position. Tracked VR uses the position from the imported room.</p>}
      </section>
      <section className="studio-section">
        <HotspotActionEditor
          hotspot={hotspot}
          scenes={scenes}
          guides={guides}
          currentSceneId={scene.id}
          onUpdate={patchHotspot}
          onEditActions={onEditActions}
          selectionRequest={selectionRequest}
          onEditProduct={onEditProduct}
        />
      </section>
      <details className="advanced-details">
        <summary>Appearance</summary>
        <label>
          Size <output>{Number(hotspot.size || 1).toFixed(1)}×</output>
          <input type="range" min="0.4" max="4" step="0.1" value={hotspot.size || 1} onChange={(event) => patchHotspot({ size: Number(event.target.value) })} />
        </label>
        <HotspotStyleEditor hotspot={hotspot} onUpdate={patchHotspot} />
      </details>
      <button className="danger studio-remove" onClick={onDelete}>Delete hotspot</button>
    </>
  )
}
