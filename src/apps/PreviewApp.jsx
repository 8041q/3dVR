import React, { useEffect, useMemo, useState } from 'react'
import Viewer from '../components/Viewer'
import { readDraftPreview } from '../preview/draftPreview'

export default function PreviewApp({ projectId = 'default' }) {
  const previewKey = useMemo(
    () => new URLSearchParams(window.location.search).get('key') || '',
    [],
  )
  const [project] = useState(() => readDraftPreview(previewKey, projectId))
  const [sceneId, setSceneId] = useState(null)

  const scenes = project?.scenes || []
  const guides = project?.guides || []

  useEffect(() => {
    if (!scenes.length) return
    if (!sceneId || !scenes.some((scene) => scene.id === sceneId)) {
      setSceneId(project?.startSceneId || scenes[0].id)
    }
  }, [project?.startSceneId, sceneId, scenes])

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

  if (!sceneId) return null

  return (
    <div className="app preview-app">
      <Viewer
        sceneId={sceneId}
        onNavigate={setSceneId}
        scenes={scenes}
        guides={guides}
      />
      <div className="preview-banner">
        <div>
          <strong>Draft preview</strong>
          <span>Not published</span>
        </div>
        <a className="button-link" href={`/editor/${encodeURIComponent(projectId)}`}>Back to editor</a>
      </div>
    </div>
  )
}
