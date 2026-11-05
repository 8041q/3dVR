import React, { useEffect, useState } from 'react'
import { draftContent } from '../../editor/draftState'

export default function ProjectManager({
  projectId,
  project,
  title,
  meta,
  token,
}) {
  const [projects, setProjects] = useState([])
  const [newTitle, setNewTitle] = useState('New project')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copy, setCopy] = useState(null)

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
    setCopy(null)

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
          draft: duplicateFrom && project ? draftContent(project) : undefined,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not create project')
      if (duplicateFrom) {
        setCopy(body)
        setProjects((current) => [body.meta, ...current])
        return
      }
      window.location.assign(`/editor/${encodeURIComponent(body.id)}`)
    } catch (createError) {
      setError(createError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="project-manager project-manager--library">
      <p>Switch projects, start a new experience, or make a copy of the current draft.</p>
      <div className="project-list" aria-label="Available projects">
        {projects.map((project) => (
          <button
            key={project.id}
            className={project.id === projectId ? 'active list-button' : 'list-button'}
            aria-current={project.id === projectId ? 'true' : undefined}
            disabled={busy}
            onClick={() => {
              if (project.id !== projectId) {
                window.location.assign(`/editor/${encodeURIComponent(project.id)}`)
              }
            }}
          >
            <span>{project.title || project.id}{project.id === projectId ? ' · Current project' : ''}</span>
            <small>{project.hasUnpublishedChanges ? 'Draft changes' : project.isPublished ? 'Published' : 'Draft only'}</small>
          </button>
        ))}
      </div>

      <h3>Create a project</h3>
      <form className="inline-form project-create-form" onSubmit={(event) => { event.preventDefault(); if (!busy && newTitle.trim()) createProject(null) }}>
        <label>New project title
          <input value={newTitle} maxLength={300} onChange={(event) => setNewTitle(event.target.value)} />
        </label>
        <button className="primary" type="submit" disabled={busy || !newTitle.trim()}>Create project</button>
      </form>
      <h3>Copy this project</h3>
      <p>The copy includes your current unsaved edits and starts as an unpublished draft.</p>
      <button onClick={() => createProject(projectId)} disabled={busy}>
        Duplicate current draft
      </button>

      {copy && <p role="status">Created {copy.title}. <a href={`/editor/${encodeURIComponent(copy.id)}`} target="_blank" rel="noopener">Open copy in a new tab</a></p>}

      {error && <div className="error-text" role="alert">{error}</div>}
    </div>
  )
}
