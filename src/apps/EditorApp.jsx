import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useProjectDraft } from '../hooks/useProjectDraft'
import LoginModal from '../components/LoginModal'
import EditorWorkspace from '../components/editor/EditorWorkspace'

function ProjectEditor({ projectId, token }) {
  const draft = useProjectDraft(projectId)
  if (draft.loading) return <div className="app-loading" role="status">Loading project…</div>
  if (draft.error || !draft.project) {
    return (
      <div className="app-loading">
        <div>
          <p className="error-text" role="alert">{draft.error || 'Could not load the project.'}</p>
          <button onClick={draft.reload}>Try again</button>
        </div>
      </div>
    )
  }
  return <EditorWorkspace projectId={projectId} draft={draft} authToken={token} />
}

export default function EditorApp({ projectId = 'default' }) {
  const auth = useAuth()
  const [showLogin, setShowLogin] = useState(true)

  if (auth.checking) return <div className="app-loading" role="status">Checking editor session…</div>
  if (auth.isEditor) return <ProjectEditor key={projectId} projectId={projectId} token={auth.token} />

  return (
    <div className="app-loading">
      <div>
        <h1>Tour editor</h1>
        <button onClick={() => setShowLogin(true)}>Sign in to edit</button>
      </div>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}
