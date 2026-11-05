import React, { useEffect, useRef, useState } from 'react'
import { draftContent } from '../../editor/draftState'
import { prepareProjectExport, uploadProjectArchive } from '../../editor/projectTransfer'

function sizeLabel(bytes) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export default function ProjectTransfer({ projectId, project, dirty, token, projects, exportId, onExportIdChange, busy, onBusyChange, onImported }) {
  const [includeEdits, setIncludeEdits] = useState(true)
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [exported, setExported] = useState(null)
  const [imported, setImported] = useState(null)
  const controller = useRef(null)
  const selection = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])

  async function exportProject() {
    if (busy) return
    onBusyChange('export')
    setError(''); setExported(null)
    try {
      const withEdits = exportId === projectId && includeEdits
      const result = await prepareProjectExport({ projectId: exportId, token,
        draft: withEdits ? draftContent(project) : undefined,
        expectedDraftRevision: withEdits ? project.meta?.draftRevision : undefined })
      const link = document.createElement('a')
      link.href = result.downloadUrl
      link.download = result.filename
      document.body.append(link)
      link.click(); link.remove()
      setExported(result)
    } catch (failure) { setError(failure.message) }
    finally { onBusyChange(null) }
  }
  async function importProject(event) {
    event.preventDefault()
    if (!file || busy) return
    const abort = new AbortController()
    controller.current = abort
    onBusyChange('import'); setError(''); setImported(null)
    setProgress({ uploaded: 0, total: file.size, processing: false })
    try {
      const result = await uploadProjectArchive(file, { token, signal: abort.signal, onProgress: setProgress })
      if (abort.signal.aborted) return
      setImported(result); setFile(null)
      if (selection.current) selection.current.value = ''
      onImported(result)
    } catch (failure) { if (!abort.signal.aborted) setError(failure.message) }
    finally { if (!abort.signal.aborted) { setProgress(null); onBusyChange(null) } }
  }
  return <section className="project-library__section project-transfer" aria-labelledby="project-transfer-title">
    <h3 id="project-transfer-title">Export & import projects</h3>
    <p>Move a complete project between installations, or keep a portable backup.</p>
    <div className="project-library__forms">
      <div>
        <h4>Export a project ZIP</h4>
        <p>Includes the draft, metadata, viewer settings, saved release history, and all referenced local media, including panorama tiles.</p>
        <label>Project to export<select value={exportId} disabled={Boolean(busy)} onChange={(event) => { onExportIdChange(event.target.value); setExported(null) }}>
          {projects.map((item) => <option key={item.id} value={item.id}>{item.title || item.id}{item.id === projectId ? ' (current)' : ''}</option>)}
        </select></label>
        {exportId === projectId && <label className="project-transfer__check">
          <input type="checkbox" checked={includeEdits} disabled={Boolean(busy)} onChange={(event) => setIncludeEdits(event.target.checked)} />
          Include current unsaved edits
        </label>}
        {dirty && exportId === projectId && <p>{includeEdits ? 'Your unsaved edits will be included without saving or changing the published tour.' : 'Only the last saved draft will be included.'}</p>}
        <button type="button" disabled={Boolean(busy)} onClick={exportProject}>{busy === 'export' ? 'Preparing ZIP…' : 'Export project ZIP'}</button>
        {exported && <p role="status">Download started: <strong>{exported.filename}</strong>. {exported.externalAssets?.length > 0 && `${exported.externalAssets.length} external URLs remain linked and are not downloaded.`}</p>}
      </div>
      <div>
        <h4>Import a project ZIP</h4>
        <p>Creates a separate unpublished project. Metadata, media, and release history are retained; existing projects and files stay intact.</p>
        <form onSubmit={importProject}>
          <label>Project ZIP file<input ref={selection} type="file" accept=".zip,application/zip" disabled={Boolean(busy)} onChange={(event) => {
            const chosen = event.target.files?.[0] || null
            setError(''); setImported(null)
            if (chosen && (!/\.zip$/i.test(chosen.name) || !chosen.size)) { setFile(null); setError('Choose a non-empty project ZIP file.'); return }
            setFile(chosen)
          }} /></label>
          {file && <p>{file.name} · {sizeLabel(file.size)}</p>}
          <button type="submit" className="primary" disabled={!file || Boolean(busy)}>{busy === 'import' ? progress?.processing ? 'Checking & importing…' : 'Uploading ZIP…' : 'Import project ZIP'}</button>
        </form>
        {progress && <div className="project-transfer__progress" role="status">
          <progress aria-label={progress.processing ? 'Importing project' : 'Uploading project ZIP'} value={progress.processing ? undefined : progress.uploaded} max={progress.total || 1} />
          <span>{progress.processing ? 'Validating the archive and restoring media. Large projects can take a while.' : `${Math.round(progress.uploaded / Math.max(1, progress.total) * 100)}% uploaded`}</span>
        </div>}
        {imported && <p role="status">Imported <strong>{imported.title}</strong> as a new draft. <a href={`/editor/${encodeURIComponent(imported.id)}`} target="_blank" rel="noopener noreferrer">Open imported project ↗</a>{imported.externalAssets?.length > 0 && ` ${imported.externalAssets.length} external URLs still need their original hosts.`}</p>}
      </div>
    </div>
    {error && <div className="error-text" role="alert">{error}</div>}
  </section>
}
