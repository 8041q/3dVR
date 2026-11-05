import React, { useState } from 'react'
import { normalizeHotspotActions } from '../../actions/actionTypes'
import PanoramaMasterUpload from './PanoramaMasterUpload'
import SpatialSceneImporter from './SpatialSceneImporter'
import { hasPanorama } from '../../panorama/panoramaSource'
import Autocomplete from '../ui/Autocomplete'

function hasSamePanorama(left, right) {
  return (left.image || '') === (right.image || '')
    && left.panorama?.kind === right.panorama?.kind
    && left.panorama?.manifestUrl === right.panorama?.manifestUrl
    && left.panorama?.assetId === right.panorama?.assetId
    && left.panorama?.revision === right.panorama?.revision
}

export default function SceneInspector({
  scene, scenes, projectId, panoramaStatus, patchScene, onRemoveScene,
  onSelectHotspot, onAddHotspot, onChoosePanorama, onPanoramaNotice, onSpatialChange, uploadAsset,
}) {
  const [notice, setNotice] = useState('')
  const tileManifest = scene.panorama?.manifestUrl
  const configured = hasPanorama(scene)
  const panoramaReady = configured && panoramaStatus?.state === 'ready'
  const sourceLabel = !configured ? 'Required' : panoramaReady ? (tileManifest && !panoramaStatus.message ? 'Tiled · Ready' : 'Ready')
    : panoramaStatus?.state === 'error' ? 'Couldn’t load' : 'Loading…'
  const groups = [...new Set(scenes.map((item) => item.group).filter(Boolean))].sort()

  function preparePanoramaApply() {
    const initialScene = scene
    setNotice('')

    return (change) => {
      let outcome = 'removed'
      patchScene((current) => {
        if (!hasSamePanorama(current, initialScene)) {
          outcome = 'changed'
          return null
        }
        outcome = 'applied'
        return change
      })

      if (outcome === 'applied') return true
      const sceneName = initialScene.title || 'the scene'
      const message = outcome === 'changed'
        ? `Upload finished. The newer panorama choice for ${sceneName} was kept.`
        : `Upload finished after ${sceneName} was removed.`
      if (onPanoramaNotice) onPanoramaNotice(message)
      else setNotice(message)
      return false
    }
  }

  return (
    <>
      <section className="studio-section">
        <label>Scene name<input value={scene.title || ''} onChange={(event) => patchScene({ title: event.target.value })} /></label>
        <label>Group<Autocomplete value={scene.group || ''} options={groups} onChange={(group) => patchScene({ group })} /></label>
      </section>

      <section className="studio-section">
        <div className="studio-section-heading">
          <h3>Panorama source</h3>
          <span className={panoramaReady ? 'studio-ready' : 'studio-warning'}>
            {sourceLabel}
          </span>
        </div>
        {!configured && <p>Add a 2:1 image for the scene’s 360° view.</p>}
        {panoramaStatus?.message && <p>{panoramaStatus.message}</p>}
        <div className="button-row">
          <button className={configured ? '' : 'primary'} onClick={onChoosePanorama}>Choose from assets</button>
        </div>
        {configured && <p>Choose another asset to replace this panorama.</p>}
        {notice && <p role="status">{notice}</p>}
        <details className="advanced-details">
          <summary>Process a large panorama</summary>
          <PanoramaMasterUpload key={scene.id} projectId={projectId} sceneId={scene.id} prepareApply={preparePanoramaApply} />
        </details>
      </section>

      <section className="studio-section">
        <div className="studio-section-heading">
          <h3>Hotspots <span>{scene.hotspots?.length || 0}</span></h3>
          <button onClick={onAddHotspot} disabled={!panoramaReady}>+ Add hotspot</button>
        </div>
        {!scene.hotspots?.length && <p>Use hotspots to link scenes or let visitors interact with what they see.</p>}
        <div className="hotspot-list">
          {(scene.hotspots || []).map((hotspot) => {
            const count = normalizeHotspotActions(hotspot).length
            return (
              <button key={hotspot.id} className="list-button" onClick={() => onSelectHotspot(hotspot.id)}>
                <span>{hotspot.label || 'Untitled hotspot'}</span>
                <small>{count ? `${count} ${count === 1 ? 'action' : 'actions'}` : 'Needs an action'} ›</small>
              </button>
            )
          })}
        </div>
      </section>

      <details className="advanced-details">
        <summary>Tracked VR room{scene.spatial?.roomUrl ? ' · Imported' : ''}</summary>
        <SpatialSceneImporter uploadAsset={uploadAsset} configured={Boolean(scene.spatial?.roomUrl)}
          onApply={(result) => onSpatialChange(result, scene.spatial?.roomUrl)}
          onDetach={() => onSpatialChange({ spatial: null }, scene.spatial?.roomUrl)} />
      </details>

      <details className="advanced-details">
        <summary>Remove scene</summary>
        <p>Deleting this scene also removes links and guide steps that point to it. Undo restores them.</p>
        <button className="danger studio-remove" disabled={scenes.length <= 1} onClick={onRemoveScene}>Delete scene</button>
      </details>
    </>
  )
}
