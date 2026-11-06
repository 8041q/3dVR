import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import AccountApp from './AccountApp'
import EntryState from '../components/EntryState'
import Viewer from '../components/Viewer'
import ProjectOfflineControl from '../components/ProjectOfflineControl'
import ProjectWatermark from '../components/ProjectWatermark'
import { useProject } from '../hooks/useProject'
import { resolveSceneId } from '../viewer/sceneSelection'
import { projectViewerSettings } from '../projectSettings.js'

export default function ViewerApp({ projectId = 'default' }) {
  const { project, loading, error, errorStatus, source, reload } = useProject(projectId)
  const auth=useAuth()
  const [selectedSceneId, setSceneId] = useState(null)
  const scenes = project?.scenes || []
  const guides = project?.guides || []
  const settings = projectViewerSettings(project)

  const sceneId = resolveSceneId(scenes, selectedSceneId, project?.startSceneId)

  if (loading) return <EntryState title="Opening your tour…" description="Loading the visitor experience." />
  if (errorStatus===401) return <AccountApp notice="Sign in to view this private tour." returnTo={location.pathname} />
  if (error) return <EntryState title={errorStatus===403 ? 'This account can’t open this tour.' : errorStatus===404 ? 'This tour isn’t available.' : 'We couldn’t open this tour.'} description={errorStatus===403 ? 'Ask a project owner for access, or use an account that already has permission.' : errorStatus===404 ? 'The tour may not be published yet. Your workspace is still available.' : 'Check your connection and try again.'}>{errorStatus===403 && auth.user && <button onClick={async()=>{await auth.logout();await reload()}}>Use another account</button>}{!errorStatus && <button onClick={reload}>Try again</button>}</EntryState>
  if (!sceneId) return <EntryState title="This tour is still taking shape." description="There are no published scenes to view yet."></EntryState>

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
