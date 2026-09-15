import React, { useEffect, useState } from 'react'

function formatDate(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function ProjectManager({
  projectId,
  title,
  meta,
  token,
  onTitleChange,
}) {
  const [projects, setProjects] = useState([])
  const [newTitle, setNewTitle] = useState('New project')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function refreshProjects() {
    try {
      const response = await fetch('/api/projects', { cache: 'no-store' })
      const body = await response.json().catch(() => [])
      if (!response.ok) throw new Error(body.error || 'Could not load projects')
      setProjects(Array.isArray(body) ? body : [])
    } catch (loadError) {
      setError(loadError.message)
    }
  }

  useEffect(() => {
    refreshProjects()
  }, [projectId, meta?.updatedAt, meta?.publishedAt])

  async function createProject(duplicateFrom = null) {
    setBusy(true)
    setError('')

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({
          title: duplicateFrom ? `${title || 'Project'} copy` : newTitle,
          duplicateFrom,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not create project')
      window.location.assign(`/editor/${encodeURIComponent(body.id)}`)
    } catch (createError) {
      setError(createError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="project-manager project-manager--details">
      <label>
        Project title
        <input value={title || ''} onChange={(event) => onTitleChange(event.target.value)} />
      </label>

      <div className="project-manager__meta">
        <span>Published: {formatDate(meta?.publishedAt)}</span>
        {meta?.publishedRevision && <span>Revision: {meta.publishedRevision}</span>}
      </div>

      <div className="editor-subheading">Projects</div>
      <div className="project-list">
        {projects.map((project) => (
          <button
            key={project.id}
            className={project.id === projectId ? 'active list-button' : 'list-button'}
            onClick={() => {
              if (project.id !== projectId) {
                window.location.assign(`/editor/${encodeURIComponent(project.id)}`)
              }
            }}
          >
            <span>{project.title || project.id}</span>
            <small>{project.hasUnpublishedChanges ? 'Draft changes' : project.isPublished ? 'Published' : 'Draft only'}</small>
          </button>
        ))}
      </div>

      <div className="inline-form project-create-form">
        <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
        <button onClick={() => createProject(null)} disabled={busy}>Create</button>
      </div>
      <button onClick={() => createProject(projectId)} disabled={busy}>
        Duplicate current project
      </button>

      {error && <div className="error-text">{error}</div>}
    </div>
  )
}
