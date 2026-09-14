import React, { useEffect, useMemo, useState } from 'react'

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
  dirty,
  saving,
  publishing,
  token,
  onTitleChange,
  onSave,
  onPublish,
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

  const status = useMemo(() => {
    if (dirty) return { label: 'Unsaved changes', tone: 'warning' }
    if (meta?.hasUnpublishedChanges) return { label: 'Draft saved - not published', tone: 'warning' }
    if (meta?.isPublished) return { label: 'Published', tone: 'success' }
    return { label: 'Not published yet', tone: 'muted' }
  }, [dirty, meta])

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
    <section className="project-manager">
      <div className="project-manager__heading">
        <div>
          <div className="editor-eyebrow">Project</div>
          <strong>{title || projectId}</strong>
        </div>
        <span className={`status-pill status-pill--${status.tone}`}>{status.label}</span>
      </div>

      <label>
        Project title
        <input value={title || ''} onChange={(event) => onTitleChange(event.target.value)} />
      </label>

      <div className="project-manager__actions">
        <button onClick={onSave} disabled={saving || publishing || !dirty}>
          {saving ? 'Saving...' : 'Save draft'}
        </button>
        <button className="primary" onClick={onPublish} disabled={saving || publishing}>
          {publishing ? 'Publishing...' : 'Publish'}
        </button>
        {meta?.isPublished && (
          <a className="button-link" href={`/v/${encodeURIComponent(projectId)}`} target="_blank" rel="noreferrer">
            Open viewer
          </a>
        )}
      </div>

      <div className="project-manager__meta">
        <span>Published: {formatDate(meta?.publishedAt)}</span>
        {meta?.publishedRevision && <span>Revision: {meta.publishedRevision}</span>}
      </div>

      <details className="project-manager__switcher">
        <summary>Projects</summary>
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
      </details>

      {error && <div className="error-text">{error}</div>}
    </section>
  )
}
