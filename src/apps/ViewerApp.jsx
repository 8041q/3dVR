import React, { useState } from 'react'
import Viewer from '../components/Viewer'
import ProjectOfflineControl from '../components/ProjectOfflineControl'
import ProjectWatermark from '../components/ProjectWatermark'
import { useProject } from '../hooks/useProject'
import { resolveSceneId } from '../viewer/sceneSelection'
import { projectViewerSettings } from '../projectSettings.js'

export default function ViewerApp({ projectId = 'default' }) {
  const { project, loading, error, source, reload } = useProject(projectId)
  const [selectedSceneId, setSceneId] = useState(null)
  const scenes = project?.scenes || []
  const guides = project?.guides || []
  const settings = projectViewerSettings(project)

  const sceneId = resolveSceneId(scenes, selectedSceneId, project?.startSceneId)

  if (loading) return <div className="app-loading">Loading project...</div>

  if (error) {
    return (
      <div className="app-loading">
        <div className="error-text">{error}</div>
        <button onClick={reload}>Retry</button>
      </div>
    )
  }

  if (!sceneId) return <div className="app-loading">This tour has no scenes yet.</div>

  return (
    <div className="app">
      <Viewer
        sceneId={sceneId}
        onNavigate={setSceneId}
        scenes={scenes}
        guides={guides}
        initialGuideId={settings.defaultGuideId}
        showGuideMenu={settings.showGuideMenu}
        openLinksInNewTab={settings.openLinksInNewTab}
        overlayChildren={<>
          {settings.allowOffline && <ProjectOfflineControl project={project} source={source} />}
          <ProjectWatermark title={project.title || project.id} offline={source === 'offline'} />
        </>}
      />
    </div>
  )
}
