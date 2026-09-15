import React, { useEffect, useMemo, useRef, useState } from 'react'

const FILTERS = ['all', 'image', 'model', 'audio', 'video']

function containsExactString(value, target) {
  if (typeof value === 'string') return value === target
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, target))
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some((item) => containsExactString(item, target))
}

function referenceLabel(reference) {
  if (!reference) return 'project data'
  if (reference.projectId && reference.kind === 'version') {
    return `${reference.projectId} revision ${reference.revision || ''}`.trim()
  }
  if (reference.projectId) return `${reference.projectId} ${reference.kind || 'project'}`
  return reference.kind || reference.file || 'project data'
}

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

export default function AssetLibrary({
  uploadAsset,
  selectedHotspot,
  onUseImage,
  onUseModel,
  authToken,
  projectContent,
}) {
  const [assets, setAssets] = useState([])
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [deletingUrl, setDeletingUrl] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  async function refresh() {
    try {
      const response = await fetch('/api/assets', { cache: 'no-store' })
      const body = await response.json().catch(() => [])
      if (!response.ok) throw new Error(body.error || 'Could not load assets')
      setAssets(Array.isArray(body) ? body : [])
    } catch (loadError) {
      setError(loadError.message)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const visible = useMemo(
    () => assets.filter((asset) => filter === 'all' || asset.type === filter),
    [assets, filter],
  )

  async function upload(file) {
    if (!file) return
    setBusy(true)
    setError('')

    try {
      await uploadAsset(file)
      await refresh()
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Asset URL', url)
    }
  }

  async function deleteAsset(asset) {
    if (!asset?.url || asset.source !== 'upload') return

    if (containsExactString(projectContent, asset.url)) {
      setError('This asset is used by the current project. Remove that reference and save the project before deleting the file.')
      return
    }

    if (!window.confirm(`Delete ${asset.name}? This removes the uploaded file from disk.`)) return

    setDeletingUrl(asset.url)
    setError('')
    try {
      const response = await fetch(`/api/assets?url=${encodeURIComponent(asset.url)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken || ''}`,
        },
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const references = Array.isArray(body.references) ? body.references : []
        const labels = [...new Set(references.map(referenceLabel))].slice(0, 4)
        const suffix = labels.length ? ` Used by: ${labels.join(', ')}.` : ''
        throw new Error(`${body.error || 'Could not delete asset.'}${suffix}`)
      }
      await refresh()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setDeletingUrl('')
    }
  }

  return (
    <section className="asset-library">
      <div className="asset-library__heading">
        <div>
          <h3>Asset library</h3>
          <div className="muted">Reuse images, models, audio and video already on the server.</div>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Uploading...' : 'Upload asset'}
        </button>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp,.glb,audio/*,video/mp4,video/webm"
          onChange={(event) => upload(event.target.files?.[0])}
        />
      </div>

      <div className="asset-library__filters">
        {FILTERS.map((item) => (
          <button
            key={item}
            className={filter === item ? 'active' : ''}
            onClick={() => setFilter(item)}
          >
            {item === 'all' ? 'All' : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      <div className="asset-grid">
        {visible.map((asset) => (
          <article className="asset-card" key={asset.url}>
            {asset.type === 'image' ? (
              <img src={asset.url} alt="" loading="lazy" />
            ) : (
              <div className="asset-card__type">{asset.type.toUpperCase()}</div>
            )}
            <div className="asset-card__body">
              <strong title={asset.name}>{asset.name}</strong>
              <span>{formatBytes(asset.bytes)} · {asset.source}</span>
              <div className="asset-card__actions">
                {asset.type === 'image' && (
                  <button onClick={() => onUseImage?.(asset)}>Use in scene</button>
                )}
                {asset.type === 'model' && (
                  <button
                    onClick={() => onUseModel?.(asset)}
                    disabled={!selectedHotspot}
                    title={selectedHotspot ? 'Add product inspection to selected hotspot' : 'Select a hotspot first'}
                  >
                    Add to hotspot
                  </button>
                )}
                <button onClick={() => copyUrl(asset.url)}>Copy URL</button>
                <a className="button-link" href={asset.url} download={asset.name}>Download</a>
                {asset.source === 'upload' && (
                  <button
                    className="danger"
                    onClick={() => deleteAsset(asset)}
                    disabled={deletingUrl === asset.url}
                    title="Delete this upload when it is no longer referenced by a project or saved revision"
                  >
                    {deletingUrl === asset.url ? 'Deleting...' : 'Delete'}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {visible.length === 0 && <div className="muted">No assets in this category yet.</div>}
      {error && <div className="error-text">{error}</div>}
    </section>
  )
}
