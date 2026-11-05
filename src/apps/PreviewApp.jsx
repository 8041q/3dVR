import React, { useState } from 'react'
import Viewer from '../components/Viewer'
import { readDraftPreview } from '../preview/draftPreview'
import { resolveSceneId } from '../viewer/sceneSelection'

export default function PreviewApp({ projectId = 'default' }) {
  const [project] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return readDraftPreview(params.get('key'), projectId)
  })
  const [selectedSceneId, setSceneId] = useState(null)

  const scenes = project?.scenes || []
  const guides = project?.guides || []

  const sceneId = resolveSceneId(scenes, selectedSceneId, project?.startSceneId)

  if (!project) {
    return (
      <div className="app-loading preview-expired">
        <div>
          <h2>Draft preview expired</h2>
          <p>This preview belongs to the editor browser that created it and expires automatically.</p>
          <a className="button-link" href={`/editor/${encodeURIComponent(projectId)}`}>Return to editor</a>
        </div>
      </div>
    )
  }

  if (!sceneId) {
    return (
      <div className="app-loading preview-expired">
        <div>
          <h2>Nothing to preview yet</h2>
          <p>Add a scene in the editor to preview this tour.</p>
          <a className="button-link" href={`/editor/${encodeURIComponent(projectId)}`}>Return to editor</a>
        </div>
      </div>
    )
  }

  return (
    <div className="app preview-app">
      <Viewer
        sceneId={sceneId}
        onNavigate={setSceneId}
        scenes={scenes}
        guides={guides}
        openLinksInNewTab
        overlayChildren={<div className="preview-banner" data-viewer-chrome="bottom">
          <div>
            <strong>Draft preview</strong>
            <span>Not published</span>
          </div>
          <a className="button-link" href={`/editor/${encodeURIComponent(projectId)}`}>Back to editor</a>
        </div>}
      />
    </div>
  )
}
