import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useProjectDraft } from '../hooks/useProjectDraft'
import AccountApp from './AccountApp'
import EntryState from '../components/EntryState'
import EditorWorkspace from '../components/editor/EditorWorkspace'
import { ModelThumbnailProvider } from '../contexts/ModelThumbnailContext'

function ProjectEditor({ projectId, token }) {
  const draft = useProjectDraft(projectId)
  if (draft.loading) return <EntryState title="Opening your project…" description="Preparing the editor." />
  if (draft.error || !draft.project) return <EntryState title="We couldn’t open this project." description="It may not be assigned to your account, or your session may have ended."><button onClick={draft.reload}>Try again</button></EntryState>
  return <EditorWorkspace projectId={projectId} draft={draft} authToken={token} />
}

export default function EditorApp({ projectId = 'default' }) {
  const auth = useAuth()
  if (auth.checking || !auth.isEditor) return <AccountApp returnTo={location.pathname} notice="Sign in to edit this project." />
  return <ModelThumbnailProvider><ProjectEditor key={projectId} projectId={projectId} token={auth.token} /></ModelThumbnailProvider>
}
