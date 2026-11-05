import Select from '../ui/Select'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './assetLibrary.css'
import AssetPreview from './AssetPreview'
import { assetUsage, containsAsset, filterAssets, uploadAssetBatch } from '../../editor/assetLibrary'

const FILTERS = ['all', 'image', 'model', 'audio', 'video']
const IMAGE_TYPES = 'image/jpeg,image/png,image/webp'

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
  selectionType,
  onUseImage,
  onUseModel,
  authToken,
  projectContent,
}) {
  const [assets, setAssets] = useState([])
  const [filter, setFilter] = useState(selectionType || 'all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deletingUrl, setDeletingUrl] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [layout, setLayout] = useState('grid')
  const [sort, setSort] = useState('newest')
  const [usageFilter, setUsageFilter] = useState('all')
  const [queue, setQueue] = useState([])
  const [preview, setPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const uploadLock = useRef(false)
  const fileRef = useRef(null)

  const refresh = useCallback(async (signal) => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/assets', { cache: 'no-store', signal })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not load assets')
      if (!Array.isArray(body)) throw new Error('Unexpected asset list')
      if (!signal?.aborted) setAssets(body)
    } catch {
      if (!signal?.aborted) setLoadError('Could not load the asset library.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const request = new AbortController()
    refresh(request.signal)
    return () => request.abort()
  }, [refresh])

  const assetType = selectionType || filter
  const visible = useMemo(() => filterAssets(assets, { type: assetType, query, usage: usageFilter, sort }, projectContent), [assets, assetType, query, usageFilter, sort, projectContent])
  const usageByUrl = useMemo(() => new Map(assets.map((asset) => [asset.url, assetUsage(projectContent, asset.url)])), [assets, projectContent])
  const totalBytes = assets.reduce((total, asset) => total + asset.bytes, 0)
  const mutating = busy || Boolean(deletingUrl)
  const completed = queue.filter((item) => item.status === 'complete').length
  const failed = queue.filter((item) => item.status === 'failed')

  async function upload(files) {
    if (!files?.length || uploadLock.current || deletingUrl) return
    uploadLock.current = true
    setBusy(true); setError(''); setNotice(''); setDragOver(false)
    try {
      const result = await uploadAssetBatch(files, async (file) => {
        const extension = file.name.split('.').at(-1).toLowerCase()
        const supported = selectionType === 'model' ? ['glb'] : selectionType === 'image' ? ['jpg', 'jpeg', 'png', 'webp'] : ['jpg', 'jpeg', 'png', 'webp', 'glb', 'mp3', 'wav', 'ogg', 'mp4', 'webm']
        if (!supported.includes(extension)) throw new Error('Unsupported file type for this library.')
        await uploadAsset(file)
      }, setQueue)
      await refresh()
      setQuery('')
      if (!selectionType) setFilter('all')
      setUsageFilter('all'); setSort('newest')
      const count = result.filter((item) => item.status === 'complete').length
      setNotice(`${count} of ${result.length} files uploaded.${count < result.length ? ' Review the failed files below.' : ''}`)
    } finally {
      setBusy(false); uploadLock.current = false
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Asset URL copied.')
    } catch {
      window.prompt('Asset URL', url)
    }
  }

  async function deleteAsset(asset) {
    if (!asset?.url || asset.source !== 'upload' || mutating) return

    if (containsAsset(projectContent, asset.url)) {
      setError('This asset is used by the current project. Remove that reference and save the project before deleting the file.')
      return
    }

    if (!window.confirm(`Delete ${asset.name}? This removes the uploaded file from disk.`)) return

    setDeletingUrl(asset.url)
    setError('')
    setNotice('')
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

  const useAsset = (asset) => asset.type === 'image' ? onUseImage?.(asset) : onUseModel?.(asset)
  return (
    <section className={`asset-library studio-asset-browser${dragOver ? ' is-dragging' : ''}`} aria-label="Asset library"
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragOver(true) } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false) }}
      onDrop={(event) => { event.preventDefault(); setDragOver(false); void upload([...event.dataTransfer.files]) }}>
      <div className="asset-library__heading">
        <div><strong>{assets.length} {assets.length === 1 ? 'file' : 'files'}</strong><span className="muted"> · {formatBytes(totalBytes)} in the library</span></div>
        <div className="button-row"><button type="button" onClick={() => refresh()} disabled={mutating || loading}>Refresh</button><button type="button" className="primary" onClick={() => fileRef.current?.click()} disabled={mutating}>{busy ? 'Uploading…' : 'Upload files'}</button></div>
        <input ref={fileRef} hidden multiple type="file" accept={selectionType === 'image' ? IMAGE_TYPES : selectionType === 'model' ? '.glb' : `${IMAGE_TYPES},.glb,.mp3,.wav,.ogg,.mp4,.webm`} onChange={(event) => upload([...event.target.files])} />
      </div>
      <button type="button" className="studio-asset-dropzone" onClick={() => fileRef.current?.click()} disabled={mutating}>
        <strong>{dragOver ? 'Drop to upload' : 'Drop files here, or choose files'}</strong>
        <span>{selectionType === 'image' ? 'JPEG, PNG or WebP images' : selectionType === 'model' ? 'GLB 3D models' : 'Images, GLB models, audio and video'} · Select multiple files at once</span>
      </button>
      {queue.length > 0 && <section className="studio-upload-queue" aria-label="Uploads" aria-busy={busy}>
        <header><strong>{busy ? `Uploading ${completed + failed.length + 1} of ${queue.length}` : `${completed} uploaded${failed.length ? ` · ${failed.length} failed` : ''}`}</strong>
          {!busy && <div className="button-row">{failed.length > 0 && <button type="button" onClick={() => upload(failed.map((item) => item.file))}>Retry failed</button>}<button type="button" onClick={() => setQueue([])}>Dismiss</button></div>}
        </header>
        {busy && <progress aria-label="Files uploaded" max={queue.length} value={completed + failed.length} />}
        <ul>{queue.map((item, index) => <li key={index}><span title={item.name}>{item.name}</span><small className={item.status === 'failed' ? 'error-text' : ''}>{item.status === 'failed' ? item.error : item.status === 'complete' ? 'Uploaded' : item.status === 'uploading' ? 'Uploading…' : 'Waiting'}</small></li>)}</ul>
      </section>}
      <div className="studio-asset-toolbar">
        <input type="search" aria-label="Search assets by name" placeholder="Search files by name or format" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label>Usage<Select value={usageFilter} onChange={(event) => setUsageFilter(event.target.value)}><option value="all">All files</option><option value="used">Used in this project</option><option value="unused">Not used in this project</option></Select></label>
        <label>Sort<Select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="largest">Largest first</option></Select></label>
        <div role="group" aria-label="Asset layout"><button type="button" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>Grid</button><button type="button" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>List</button></div>
      </div>
      {!selectionType && <div className="asset-library__filters" role="group" aria-label="File types">{FILTERS.map((item) => <button type="button" key={item} aria-pressed={filter === item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{({ all: 'All files', image: 'Images', model: '3D models', audio: 'Audio', video: 'Video' })[item]} <span>{assets.filter((asset) => item === 'all' || asset.type === item).length}</span></button>)}</div>}
      <p className="muted studio-asset-feedback" role="status">{loading ? 'Loading files…' : notice || `Showing ${visible.length} of ${assets.length} files. Select a file to preview it.`}</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {loadError && <p className="error-text" role="alert">{loadError} <button type="button" onClick={() => refresh()}>Retry</button></p>}
      {!loading && !loadError && !visible.length && <div className="studio-asset-empty"><h3>{assets.length ? 'No files match these filters' : 'Your library is empty'}</h3><p>{assets.length ? 'Try a different name, file type or usage filter.' : 'Upload files here, then choose them when editing a scene or product.'}</p>{assets.length > 0 && <button type="button" onClick={() => { setQuery(''); setFilter('all'); setUsageFilter('all') }}>Clear filters</button>}</div>}
      <ul className={`studio-asset-list studio-asset-list--${layout}`} aria-label="Matching assets" aria-busy={loading}>
        {visible.map((asset) => <li className="studio-asset-row" key={asset.url}>
          <button type="button" className="studio-asset-thumbnail" aria-label={`Preview ${asset.name}`} onClick={() => setPreview(asset)}>
            {asset.type === 'image' ? <img src={`/api/assets/thumbnail?url=${encodeURIComponent(asset.url)}&v=${encodeURIComponent(asset.updatedAt)}`} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true }} /> : <span>{({ model: '3D', audio: 'Audio', video: 'Video' })[asset.type] || asset.extension}</span>}
            <small>{asset.extension?.slice(1).toUpperCase()}</small>
          </button>
          <div className="studio-asset-info"><button type="button" title={asset.name} onClick={() => setPreview(asset)}>{asset.name}</button><span>{formatBytes(asset.bytes)} · {asset.source === 'demo' ? 'Sample file' : new Date(asset.updatedAt).toLocaleDateString()}</span>
            <span className={usageByUrl.get(asset.url)?.length ? 'studio-asset-used' : ''}>{usageByUrl.get(asset.url)?.length ? `Used in ${usageByUrl.get(asset.url).length} ${usageByUrl.get(asset.url).length === 1 ? 'place' : 'places'} in this project` : 'Not used in this project'}</span></div>
          <div className="studio-asset-controls">
            {((asset.type === 'image' && onUseImage) || (asset.type === 'model' && onUseModel)) ? <button type="button" className="primary" aria-label={`Use ${asset.type} ${asset.name}`} disabled={mutating} onClick={() => useAsset(asset)}>Use {asset.type}</button> : <button type="button" onClick={() => setPreview(asset)}>Preview</button>}
            <details><summary aria-label={`Manage ${asset.name}`}>More</summary><div className="studio-asset-menu"><button type="button" onClick={() => copyUrl(asset.url)}>Copy link</button><a className="button-link" href={asset.url} download={asset.name}>Download</a>{asset.source === 'upload' && <button type="button" className="danger" onClick={() => deleteAsset(asset)} disabled={mutating || loading || Boolean(usageByUrl.get(asset.url)?.length)} title={usageByUrl.get(asset.url)?.length ? 'Remove this file from the project before deleting it.' : undefined}>{deletingUrl === asset.url ? 'Deleting…' : 'Delete file'}</button>}</div></details>
          </div>
        </li>)}
      </ul>
      {preview && <AssetPreview key={preview.url} asset={preview} project={projectContent} onClose={() => setPreview(null)} onUse={(preview.type === 'image' && onUseImage) || (preview.type === 'model' && onUseModel) ? useAsset : undefined} />}
    </section>
  )
}
