import React, { useEffect, useMemo, useState } from 'react'
import { draftContent } from '../../editor/draftState'
import ProjectTransfer from './ProjectTransfer'
import './projectDetails.css'

function projectStatus(project) {
  if (!project.isPublished) return { key: 'draft', label: 'Draft only' }
  return project.hasUnpublishedChanges ? { key: 'changes', label: 'Unpublished changes' } : { key: 'published', label: 'Published' }
}
function formatDate(value) {
  const date = new Date(value)
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Not saved yet'
}

export default function ProjectManager({ projectId, project, title, meta, token, dirty, onOpenDetails }) {
  const [projects, setProjects] = useState([])
  const [newTitle, setNewTitle] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [copyTitle, setCopyTitle] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('updated')
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [copy, setCopy] = useState(null)
  const [exportId, setExportId] = useState(projectId)
  const duplicateTitle = copyTitle ?? `${title || 'Project'} copy`

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError('')
    fetch('/api/projects', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const body = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(body)) throw new Error(body?.error || 'Could not load the project library.')
      if (!controller.signal.aborted) setProjects(body)
    }).catch((failure) => {
      if (!controller.signal.aborted) setLoadError(failure.message)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [projectId, meta?.updatedAt, meta?.publishedAt, reload])

  const library = useMemo(() => {
    const current = {
      ...projects.find((item) => item.id === projectId), ...meta, id: projectId, title,
      author: project.metadata?.author || '', description: project.metadata?.description || '',
      sceneCount: project.scenes?.length || 0, guideCount: project.guides?.length || 0,
      hasUnpublishedChanges: dirty || meta?.hasUnpublishedChanges,
    }
    return [current, ...projects.filter((item) => item.id !== projectId)]
  }, [projects, projectId, meta, title, project, dirty])
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    return library.filter((item) => (filter === 'all' || projectStatus(item).key === filter)
      && [item.title, item.id, item.author, item.description].some((value) => String(value || '').toLocaleLowerCase().includes(search)))
      .sort((a, b) => sort === 'name' ? String(a.title || a.id).localeCompare(String(b.title || b.id))
        : String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  }, [library, query, filter, sort])

  async function createProject(duplicate) {
    const chosenTitle = (duplicate ? duplicateTitle : newTitle).trim()
    if (busy || !chosenTitle) return
    setBusy(duplicate ? 'copy' : 'create')
    setError('')
    setCopy(null)
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ title: chosenTitle,
          metadata: duplicate ? undefined : { author: newAuthor, description: newDescription },
          duplicateFrom: duplicate ? projectId : null, draft: duplicate ? draftContent(project) : undefined }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not create project')
      setReload((value) => value + 1)
      if (duplicate) setCopy(body)
      else window.location.assign(`/editor/${encodeURIComponent(body.id)}`)
    } catch (failure) { setError(failure.message) }
    finally { setBusy(null) }
  }

  return <div className="project-library">
    <section className="project-library__section" aria-labelledby="project-library-title">
      <div className="project-library__heading">
        <div><h3 id="project-library-title">Project library <span>{library.length}</span></h3><p>Find a project by name, author, or description.</p></div>
        <div className="project-library__header-actions">
          <a className="button-link" href="#project-transfer-title">Export / import</a>
          <button type="button" onClick={() => setReload((value) => value + 1)} disabled={loading}>Refresh projects</button>
        </div>
      </div>
      <div className="project-library__filters">
        <label>Search projects<input type="search" value={query} placeholder="Search projects…" onChange={(event) => setQuery(event.target.value)} /></label>
        <label>Status<select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All projects</option><option value="published">Published</option><option value="changes">Unpublished changes</option><option value="draft">Draft only</option>
        </select></label>
        <label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="updated">Recently updated</option><option value="name">Project name</option>
        </select></label>
      </div>
      {loading && <p role="status">Loading projects…</p>}
      {loadError && <div className="project-library__notice" role="alert">{loadError} Your current project is available below. Use Refresh projects to try again.</div>}
      <div className="project-library__list" aria-label="Available projects" aria-busy={loading}>
        {visible.map((item) => {
          const current = item.id === projectId
          const status = projectStatus(item)
          return <article className={`project-library__project${current ? ' is-current' : ''}`} key={item.id} aria-label={item.title || item.id}>
            <div className="project-library__project-heading"><h4>{item.title || item.id}</h4><span className={`project-library__status is-${status.key}`}>{status.label}</span></div>
            <p>{item.description || 'No description yet.'}</p>
            <div className="project-library__project-meta">
              <span>{item.author || 'Author not specified'}</span>
              <span>{item.sceneCount ?? 0} {(item.sceneCount ?? 0) === 1 ? 'scene' : 'scenes'} · {item.guideCount ?? 0} {(item.guideCount ?? 0) === 1 ? 'guide' : 'guides'}</span>
              <span>Updated {formatDate(item.updatedAt)}</span>
            </div>
            <div className="project-library__project-actions">
              {current && <span className="project-library__current">Current project{dirty ? ' · Unsaved edits' : ''}</span>}
              {current ? <button type="button" onClick={onOpenDetails}>Edit project details</button>
                : <a className="button-link" href={`/editor/${encodeURIComponent(item.id)}`}>Open editor</a>}
              {item.isPublished && <a className="button-link" href={`/v/${encodeURIComponent(item.id)}`} target="_blank" rel="noopener noreferrer">Open published tour ↗</a>}
              <button type="button" disabled={Boolean(busy)} onClick={() => {
                setExportId(item.id)
                document.getElementById('project-transfer-title')?.scrollIntoView({ block: 'start' })
              }}>Export ZIP</button>
            </div>
          </article>
        })}
        {!visible.length && <div className="project-library__empty"><h4>No projects match</h4><p>Try a different search or status.</p><button type="button" onClick={() => { setQuery(''); setFilter('all') }}>Clear filters</button></div>}
      </div>
    </section>
    <ProjectTransfer projectId={projectId} project={project} dirty={dirty} token={token} projects={library}
      exportId={exportId} onExportIdChange={setExportId} busy={busy} onBusyChange={setBusy}
      onImported={(result) => {
        setProjects((current) => [{ ...result.meta, author: result.metadata?.author, description: result.metadata?.description,
          sceneCount: result.scenes?.length || 0, guideCount: result.guides?.length || 0 }, ...current])
        setQuery(''); setFilter('all'); setReload((value) => value + 1)
      }} />
    <div className="project-library__forms">
      <section className="project-library__section" aria-labelledby="project-create-title">
        <h3 id="project-create-title">Create a project</h3><p>Start a new experience with its own draft and public link.</p>
        <form onSubmit={(event) => { event.preventDefault(); createProject(false) }}>
          <label>New project title<input required maxLength={300} value={newTitle} placeholder="e.g. Studio tour" onChange={(event) => setNewTitle(event.target.value)} /></label>
          <label>Author<input maxLength={200} value={newAuthor} placeholder="Person or team" onChange={(event) => setNewAuthor(event.target.value)} /></label>
          <label>Description<textarea rows={3} maxLength={2000} value={newDescription} placeholder="What is this project about?" onChange={(event) => setNewDescription(event.target.value)} /></label>
          <button type="submit" className="primary" disabled={Boolean(busy) || !newTitle.trim()}>{busy === 'create' ? 'Creating…' : 'Create project'}</button>
        </form>
      </section>
      <section className="project-library__section" aria-labelledby="project-copy-title">
        <h3 id="project-copy-title">Duplicate current draft</h3><p>Copy <strong>{title || 'this project'}</strong>, including unsaved edits, metadata, and viewer settings. The copy starts unpublished.</p>
        <form onSubmit={(event) => { event.preventDefault(); createProject(true) }}>
          <label>Copy title<input required maxLength={300} value={duplicateTitle} onChange={(event) => setCopyTitle(event.target.value)} /></label>
          <button type="submit" disabled={Boolean(busy) || !duplicateTitle.trim()}>{busy === 'copy' ? 'Duplicating…' : 'Duplicate current draft'}</button>
        </form>
        {dirty && <p className="project-library__notice">Your current draft has unsaved edits. They will be included in the copy.</p>}
        {copy && <p role="status">Created <strong>{copy.title}</strong>. <a href={`/editor/${encodeURIComponent(copy.id)}`} target="_blank" rel="noopener noreferrer">Open copy in a new tab ↗</a></p>}
      </section>
    </div>
    {error && <div className="error-text" role="alert">{error}</div>}
  </div>
}
