import React, { useState } from 'react'
import Viewer from '../components/Viewer'
import EntryState from '../components/EntryState'
import BackLink from '../components/ui/BackLink'
import { readDraftPreview } from '../preview/draftPreview'
import { resolveSceneId } from '../viewer/sceneSelection'
import { projectViewerSettings } from '../projectSettings.js'

export default function PreviewApp({ projectId = 'default' }) {
  const [project] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return readDraftPreview(params.get('key'), projectId)
  })
  const [selectedSceneId, setSceneId] = useState(null)

  const scenes = project?.scenes || []
  const guides = project?.guides || []
  const settings = projectViewerSettings(project)

  const sceneId = resolveSceneId(scenes, selectedSceneId, project?.startSceneId)

  if (!project) {
    return <EntryState title="Draft preview expired" description="This preview belongs to the editor browser that created it and expires automatically." backTo={`/editor/${encodeURIComponent(projectId)}`} backLabel="Back to editor" />
  }

  if (!sceneId) {
    return <EntryState title="Nothing to preview yet" description="Add a scene in the editor to preview this tour." backTo={`/editor/${encodeURIComponent(projectId)}`} backLabel="Back to editor" />
  }

  return (
    <div className="app preview-app">
      <Viewer
        sceneId={sceneId}
        onNavigate={setSceneId}
        scenes={scenes}
        guides={guides}
        initialGuideId={settings.defaultGuideId}
        showGuideMenu={settings.showGuideMenu}
        openLinksInNewTab
        overlayChildren={<div className="preview-banner" data-viewer-chrome="bottom">
          <BackLink href={`/editor/${encodeURIComponent(projectId)}`}>Back to editor</BackLink>
          <div>
            <strong>Draft preview</strong>
            <span>Not published</span>
          </div>
        </div>}
      />
    </div>
  )
}
