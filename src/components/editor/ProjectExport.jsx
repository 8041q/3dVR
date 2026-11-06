import React, { useState } from 'react'
import { draftContent } from '../../editor/draftState'
import { prepareProjectExport } from '../../editor/projectTransfer'
import './projectDetails.css'

export default function ProjectExport({ projectId, project, dirty, token }) {
  const [includeEdits, setIncludeEdits] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [exported, setExported] = useState(null)
  async function exportProject() {
    if (busy) return
    setBusy(true); setError(''); setExported(null)
    try {
      const result = await prepareProjectExport({ projectId, token,
        draft: includeEdits ? draftContent(project) : undefined,
        expectedDraftRevision: includeEdits ? project.meta?.draftRevision : undefined })
      const link = document.createElement('a')
      link.href = result.downloadUrl
      link.download = result.filename
      document.body.append(link)
      link.click(); link.remove()
      setExported(result)
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <section className="project-export" aria-labelledby="project-export-title" aria-busy={busy}>
    <h3 id="project-export-title">Back up this project</h3>
    <p>Download <strong>{project.title || 'Untitled tour'}</strong> as a portable ZIP. It includes the draft, credits, viewer settings, saved release history and referenced local media.</p>
    <p>To restore it on this or another server, choose <strong>Import project</strong> in your workspace.</p>
    <label className="project-export__check"><input type="checkbox" checked={includeEdits} disabled={busy} onChange={event => { setIncludeEdits(event.target.checked); setExported(null) }} />Include current unsaved edits</label>
    {dirty && <p>{includeEdits ? 'Your unsaved edits will be included without changing the saved draft or published tour.' : 'Only the last saved draft will be included.'}</p>}
    <button type="button" className="primary" disabled={busy} onClick={exportProject}>{busy ? 'Preparing ZIP…' : 'Export project ZIP'}</button>
    {error && <p className="error-text" role="alert">{error}</p>}
    {exported && <p role="status">Download started: <strong>{exported.filename}</strong>.{exported.externalAssets?.length > 0 && ` ${exported.externalAssets.length} external URLs remain linked and are not downloaded.`}</p>}
  </section>
}
