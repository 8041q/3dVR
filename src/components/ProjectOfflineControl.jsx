import React, { useCallback, useEffect, useState } from 'react'
import { cacheCurrentAppShell, supportsOfflineViewer, verifyCachedAppShell } from '../offline/serviceWorker'
import {
  downloadProject,
  getDownloadedProjectRecord,
  removeDownloadedProject,
  verifyDownloadedAssets,
} from '../offline/projectStore'

const formatBytes = (value = 0) => (
  value < 1024 ** 3
    ? `${(value / 1024 ** 2).toFixed(1)} MB`
    : `${(value / 1024 ** 3).toFixed(2)} GB`
)

export default function ProjectOfflineControl({ project, source }) {
  const [record, setRecord] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const [verified, setVerified] = useState(false)
  const supported = supportsOfflineViewer()

  const refresh = useCallback(async (isCurrent = () => true) => {
    setChecking(true)
    const download = await getDownloadedProjectRecord(project.id).catch(() => null)
    const ready = download && await Promise.all([
      verifyDownloadedAssets(download),
      verifyCachedAppShell(download.shell),
    ]).then((results) => results.every(Boolean)).catch(() => false)
    if (!isCurrent()) return
    setRecord(download)
    setVerified(Boolean(ready))
    setChecking(false)
  }, [project.id])

  useEffect(() => {
    let active = true
    const check = () => { void refresh(() => active) }
    check()
    navigator.serviceWorker?.addEventListener('controllerchange', check)
    return () => {
      active = false
      navigator.serviceWorker?.removeEventListener('controllerchange', check)
    }
  }, [refresh, project.revision])

  const current = record?.revision === project.revision
  const ready = current && verified && !checking
  const needsUpdate = record && !current
  const status = busy ? 'Saving…' : checking ? 'Checking…' : ready ? 'Ready offline' : needsUpdate ? 'Update available' : record ? 'Save again' : 'Not saved'

  async function save() {
    setBusy(true)
    setError('')
    setProgress(null)
    try {
      const shell = await cacheCurrentAppShell()
      const result = await downloadProject(project, { shell, onProgress: setProgress })
      setProgress({ completed: result.assetCount, total: result.assetCount, bytes: result.bytes })
      await refresh()
    } catch (saveError) {
      setProgress(null)
      setError(saveError.message || 'Could not prepare the offline copy.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await removeDownloadedProject(project.id)
      setProgress(null)
      await refresh()
    } catch (removeError) {
      setError(removeError.message || 'Could not remove the offline copy.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="floating-card offline-control" data-viewer-chrome="top" onKeyDown={(event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.currentTarget.open = false
      event.currentTarget.querySelector('summary')?.focus()
    }}>
      <summary>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" />
        </svg>
        <span>Offline Mode</span>
        {ready && <span className="offline-control__ready" role="img" aria-label="Ready offline">✓</span>}
      </summary>
      <div className="offline-control__panel" aria-busy={busy}>
        <strong className="offline-control__title">{project.title || 'Tour'}</strong>
        <dl className="offline-control__metadata">
          <div><dt>Status</dt><dd role="status">{source === 'offline' && ready ? 'Viewing offline' : status}</dd></div>
          <div><dt>Scenes</dt><dd>{project.scenes?.length || 0}</dd></div>
          {record && <div><dt>Saved size</dt><dd>{formatBytes(record.bytes)} · {record.assetCount} files</dd></div>}
          {record?.downloadedAt && <div><dt>Saved</dt><dd>{new Date(record.downloadedAt).toLocaleDateString()}</dd></div>}
          {!supported && <div><dt>Availability</dt><dd>Published tours only</dd></div>}
        </dl>
        {busy && progress && (
          <div className="offline-control__progress" role="status">
            <progress aria-label="Saving tour" value={progress.completed} max={Math.max(1, progress.total)} />
            <span>{progress.completed} / {progress.total} files · {formatBytes(progress.bytes)}</span>
          </div>
        )}
        {error && <div className="error-text" role="alert">{error}</div>}
        <div className="button-row">
          {!ready && <button className="primary" disabled={!supported || busy || checking} onClick={save}>
            {busy ? 'Saving…' : needsUpdate ? 'Update saved tour' : record ? 'Save again' : 'Save for offline'}
          </button>}
          {record && <button disabled={busy || checking} onClick={remove}>Remove saved tour</button>}
        </div>
      </div>
    </details>
  )
}
