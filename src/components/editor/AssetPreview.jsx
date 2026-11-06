import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { InteractionProvider } from '../../contexts/InteractionContext'
import ProductInspector3D from '../product/ProductInspector3D'
import ThumbnailCapture from './ModelThumbnailCapture'
import { assetUsage } from '../../editor/assetLibrary'


export default function AssetPreview({ asset, project, onClose, onUse, onThumbnailReady }) {
  const dialog = useRef(null)
  const [dimensions, setDimensions] = useState('')
  const [failed, setFailed] = useState(false)
  const [modelStatus, setModelStatus] = useState('loading')
  const [interactive, setInteractive] = useState(!asset.thumbnailUrl)
  const [thumbnailState, setThumbnailState] = useState('')
  const [captureAttempt, setCaptureAttempt] = useState(0)
  const [thumbnailFailed, setThumbnailFailed] = useState(false)
  const controller = useRef(null)
  const model = useRef(null)
  const inspection = useMemo(() => ({ modelUrl: asset.url, title: asset.name, id: asset.url, rotationY: -35, viewer: { startPitch: 18 } }), [asset.url, asset.name])
  const handleModelStatus = useCallback((status) => {
    setModelStatus(status.state)
    if (status.state === 'error') setFailed(true)
  }, [])
  const usage = assetUsage(project, asset.url)
  const saveThumbnail = useCallback(async blob => {
    if (!blob) { setThumbnailState('Could not capture a thumbnail.'); return }
    const abort = new AbortController()
    controller.current = abort
    setThumbnailState('Saving thumbnail…')
    try {
      const response = await fetch(`/api/assets/model-thumbnail?url=${encodeURIComponent(asset.url)}&v=${encodeURIComponent(asset.updatedAt)}`, {
        method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob, signal: abort.signal,
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Could not save the thumbnail.')
      setThumbnailState('Thumbnail saved for the asset library.')
      onThumbnailReady?.(asset.url, result.thumbnailUrl)
    } catch (failure) {
      if (!abort.signal.aborted) setThumbnailState(failure.message)
    }
  }, [asset.url, asset.updatedAt, onThumbnailReady])
  useEffect(() => {
    const opener = document.activeElement
    dialog.current.showModal()
    return () => { controller.current?.abort(); if (opener?.isConnected) opener.focus() }
  }, [])
  return <dialog ref={dialog} className="studio-asset-preview" aria-label={`Preview ${asset.name}`} onCancel={(event) => { event.preventDefault(); onClose() }}>
    <header><div><h2>{asset.name}</h2><span>{asset.type === 'model' ? '3D model' : asset.type} · {dimensions || asset.extension?.slice(1).toUpperCase()}</span></div><button type="button" onClick={onClose}>Close</button></header>
    <div className={`studio-asset-preview__media studio-asset-preview__media--${asset.type}`}>
      {failed ? <p role="alert">This file could not be previewed. You can download it to open it on your device.</p>
        : asset.type === 'image' ? <img src={asset.url} alt={asset.name} onLoad={(event) => setDimensions(`${event.target.naturalWidth} × ${event.target.naturalHeight} px`)} onError={() => setFailed(true)} />
          : asset.type === 'model' ? !interactive && !thumbnailFailed
            ? <img className="studio-model-thumbnail-preview" src={asset.thumbnailUrl} alt={asset.name} onError={() => setThumbnailFailed(true)} />
            : interactive ? <InteractionProvider><Canvas gl={{ preserveDrawingBuffer: true }} camera={{ fov: 45 }}><ProductInspector3D ref={model} standalone showControls={false} showAnnotations={false} inspection={inspection} onClose={onClose} onStatusChange={handleModelStatus} />{captureAttempt > 0 && <ThumbnailCapture key={captureAttempt} ready={modelStatus === 'ready'} onCapture={saveThumbnail} />}</Canvas></InteractionProvider> : <p className="studio-model-thumbnail-missing">The saved thumbnail is unavailable. Open the 3D preview to recreate it.</p>
            : asset.type === 'video' ? <video src={asset.url} controls preload="metadata" onError={() => setFailed(true)} />
              : <audio src={asset.url} controls preload="metadata" onError={() => setFailed(true)} />}
    </div>
    {asset.type === 'model' && !failed && <>
      <div className="studio-asset-preview__hint"><span role="status">{!interactive ? 'Saved thumbnail. The full model loads only when you open 3D preview.' : modelStatus === 'loading' ? 'Loading model to create a preview…' : 'Drag to rotate. Scroll or pinch to zoom.'}</span>{!interactive ? <button type="button" className="primary" onClick={() => { setInteractive(true); if (thumbnailFailed) setCaptureAttempt(1) }}>Open 3D preview</button> : <button type="button" disabled={modelStatus !== 'ready'} onClick={() => model.current?.resetView()}>Reset view</button>}</div>
      {interactive && modelStatus === 'ready' && <div className="studio-asset-preview__hint"><span role="status">{thumbnailState || (asset.thumbnailUrl ? 'This model has a saved thumbnail.' : 'The library generates thumbnails automatically.')}</span><button type="button" disabled={['Saving thumbnail…','Capturing thumbnail…'].includes(thumbnailState)} onClick={() => { setThumbnailState('Capturing thumbnail…'); setCaptureAttempt(value => value + 1) }}>Save current view as thumbnail</button></div>}
    </>}
    <footer>
      <div><strong>{usage.length ? 'Used in this project' : 'Not used in this project'}</strong><p>{usage.map((item) => `${item.kind}: ${item.label}`).join(' · ') || 'You can add this asset from a scene or product editor.'}</p></div>
      <div className="button-row"><a className="button-link" href={asset.url} download={asset.name}>Download</a>{onUse && <button type="button" className="primary" onClick={() => onUse(asset)}>Use {asset.type === 'model' ? 'model' : 'image'}</button>}</div>
    </footer>
  </dialog>
}
