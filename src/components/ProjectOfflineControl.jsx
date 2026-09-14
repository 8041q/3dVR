import React, { useEffect, useState } from 'react'
import { cacheCurrentAppShell } from '../offline/serviceWorker'
import {
  downloadProject,
  getDownloadedProjectRecord,
  getStorageEstimate,
  removeDownloadedProject,
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
  const [storage, setStorage] = useState(null)

  async function refresh() {
    setRecord(await getDownloadedProjectRecord(project.id).catch(() => null))
    setStorage(await getStorageEstimate())
  }

  useEffect(() => {
    refresh()
  }, [project.id, project.revision])

  const current = record?.revision === project.revision

  async function save() {
    setBusy(true)
    setError('')
    try {
      await cacheCurrentAppShell()
      const result = await downloadProject(project, setProgress)
      setProgress({ completed: result.assetCount, total: result.assetCount, bytes: result.bytes })
      await refresh()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await removeDownloadedProject(project.id)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="floating-card offline-control">
      <summary>Offline project{current ? ' - ready' : ''}</summary>
      <div className="muted">
        {source === 'offline'
          ? 'Currently using the local copy.'
          : current
            ? `Downloaded - ${formatBytes(record.bytes)}`
            : 'Download this project explicitly for exhibition/offline use.'}
      </div>
      {progress && <div>Files {progress.completed}/{progress.total} - {formatBytes(progress.bytes)}</div>}
      {storage?.quota && (
        <div className="muted">Device storage: {formatBytes(storage.usage)} / {formatBytes(storage.quota)}</div>
      )}
      {error && <div className="error-text">{error}</div>}
      <div className="button-row">
        <button disabled={busy || current} onClick={save}>
          {record ? 'Update offline copy' : 'Download project'}
        </button>
        {record && <button disabled={busy} onClick={remove}>Remove</button>}
      </div>
    </details>
  )
}
