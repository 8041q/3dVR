import React, { useEffect, useRef, useState } from 'react'
import { uploadProjectArchive } from '../editor/projectTransfer'
import { Notice, PanelHeading } from './accountUi'

export default function ProjectImport({ onImported, onBusyChange }) {
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(null)
  const controller = useRef(null)
  const selection = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])

  async function submit(event) {
    event.preventDefault()
    if (!file || progress) return
    const abort = new AbortController()
    controller.current = abort
    onBusyChange?.(true)
    setError(''); setImported(null)
    setProgress({ uploaded: 0, total: file.size, processing: false })
    try {
      const result = await uploadProjectArchive(file, { signal: abort.signal, onProgress: setProgress })
      if (abort.signal.aborted) return
      setImported(result); setFile(null)
      if (selection.current) selection.current.value = ''
      onImported(result)
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure.message)
    } finally {
      if (!abort.signal.aborted) { setProgress(null); onBusyChange?.(false) }
    }
  }

  return <section className="account-panel" aria-labelledby="project-import-title">
    <PanelHeading id="project-import-title" title="Import a project" description="Restore a project ZIP as a separate private draft, including its media, settings and release history." />
    <Notice error>{error}</Notice>
    <form className="account-form account-form--compact" onSubmit={submit}>
      <label className="account-field">Project ZIP file<input ref={selection} type="file" accept=".zip,application/zip" disabled={Boolean(progress)} onChange={event => {
        const chosen = event.target.files?.[0] || null
        setError(''); setImported(null)
        if (chosen && (!/\.zip$/i.test(chosen.name) || !chosen.size)) { setFile(null); setError('Choose a non-empty project ZIP file.'); return }
        setFile(chosen)
      }} /></label>
      {file && <p className="account-help">{file.name} · {(file.size / 1024 ** 2).toFixed(1)} MB</p>}
      <button className="account-primary" disabled={!file || Boolean(progress)}>{progress ? progress.processing ? 'Checking & importing…' : 'Uploading ZIP…' : 'Import project'}</button>
    </form>
    {progress && <div className="account-import-progress" role="status">
      <progress aria-label={progress.processing ? 'Importing project' : 'Uploading project ZIP'} value={progress.processing ? undefined : progress.uploaded} max={progress.total || 1} />
      <p className="account-help">{progress.processing ? 'Validating the archive and restoring media. Large projects can take a while.' : `${Math.round(progress.uploaded / Math.max(1, progress.total) * 100)}% uploaded`}</p>
    </div>}
    {imported && <Notice>Imported <strong>{imported.title}</strong>. <a href={`/editor/${encodeURIComponent(imported.id)}`}>Open editor →</a>{imported.externalAssets?.length > 0 && ` ${imported.externalAssets.length} external URLs still need their original hosts.`}</Notice>}
  </section>
}
