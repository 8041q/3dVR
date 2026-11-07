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

const ERROR_COPY = {
  403: {
    title: 'This account can’t open this tour.',
    description: 'Ask a project owner for access, or use an account that already has permission.',
  },
  404: {
    title: 'This tour isn’t available.',
    description: 'The tour may not be published yet. Your workspace is still available.',
  },
  default: {
    title: 'We couldn’t open this tour.',
    description: 'Check your connection and try again.',
  },
}

export default function ViewerApp({ projectId = 'default' }) {
  const { project, loading, error, errorStatus, source, reload } = useProject(projectId)
  const auth = useAuth()
  const [selectedSceneId, setSceneId] = useState(null)
  const scenes = project?.scenes || []
  const guides = project?.guides || []
  const settings = projectViewerSettings(project)

  const sceneId = resolveSceneId(scenes, selectedSceneId, project?.startSceneId)

  // Visitor-facing screens: no studio back-link, no studio label.
  const entry = { backTo: auth.user ? '/' : null, eyebrow: 'Virtual tour' }

  if (loading) return <EntryState {...entry} title="Opening your tour…" description="Loading the visitor experience." />

  if (errorStatus === 401) {
    return <AccountApp notice="Sign in to view this private tour." returnTo={location.pathname} />
  }

  if (error) {
    const copy = ERROR_COPY[errorStatus] || ERROR_COPY.default
    return (
      <EntryState {...entry} title={copy.title} description={copy.description}>
        {errorStatus === 403 && auth.user && (
          <button onClick={async () => { await auth.logout(); await reload() }}>Use another account</button>
        )}
        {!errorStatus && <button onClick={reload}>Try again</button>}
      </EntryState>
    )
  }

  if (!sceneId) return <EntryState {...entry} title="This tour is still taking shape." description="There are no published scenes to view yet." />

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