import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { InteractionProvider } from '../../contexts/InteractionContext'
import ProductInspector3D from '../product/ProductInspector3D'
import { assetUsage } from '../../editor/assetLibrary'

export default function AssetPreview({ asset, project, onClose, onUse }) {
  const dialog = useRef(null)
  const [dimensions, setDimensions] = useState('')
  const [failed, setFailed] = useState(false)
  const [modelStatus, setModelStatus] = useState('loading')
  const model = useRef(null)
  const inspection = useMemo(() => ({ modelUrl: asset.url, title: asset.name, id: asset.url, rotationY: -35, viewer: { startPitch: 18 } }), [asset.url, asset.name])
  const handleModelStatus = useCallback((status) => {
    setModelStatus(status.state)
    if (status.state === 'error') setFailed(true)
  }, [])
  const usage = assetUsage(project, asset.url)
  useEffect(() => {
    const opener = document.activeElement
    dialog.current.showModal()
    return () => opener?.focus?.()
  }, [])
  return <dialog ref={dialog} className="studio-asset-preview" aria-label={`Preview ${asset.name}`} onCancel={(event) => { event.preventDefault(); onClose() }}>
    <header><div><h2>{asset.name}</h2><span>{asset.type === 'model' ? '3D model' : asset.type} · {dimensions || asset.extension?.slice(1).toUpperCase()}</span></div><button type="button" onClick={onClose}>Close</button></header>
    <div className={`studio-asset-preview__media studio-asset-preview__media--${asset.type}`}>
      {failed ? <p role="alert">This file could not be previewed. You can download it to open it on your device.</p>
        : asset.type === 'image' ? <img src={asset.url} alt={asset.name} onLoad={(event) => setDimensions(`${event.target.naturalWidth} × ${event.target.naturalHeight} px`)} onError={() => setFailed(true)} />
          : asset.type === 'model' ? <InteractionProvider><Canvas camera={{ fov: 45 }}><ProductInspector3D ref={model} standalone showControls={false} inspection={inspection} onClose={onClose} onStatusChange={handleModelStatus} /></Canvas></InteractionProvider>
            : asset.type === 'video' ? <video src={asset.url} controls preload="metadata" onError={() => setFailed(true)} />
              : <audio src={asset.url} controls preload="metadata" onError={() => setFailed(true)} />}
    </div>
    {asset.type === 'model' && !failed && <div className="studio-asset-preview__hint"><span role="status">{modelStatus === 'loading' ? 'Loading model…' : 'Drag to rotate. Scroll or pinch to zoom.'}</span><button type="button" disabled={modelStatus !== 'ready'} onClick={() => model.current?.resetView()}>Reset view</button></div>}
    <footer>
      <div><strong>{usage.length ? 'Used in this project' : 'Not used in this project'}</strong><p>{usage.map((item) => `${item.kind}: ${item.label}`).join(' · ') || 'You can add this asset from a scene or product editor.'}</p></div>
      <div className="button-row"><a className="button-link" href={asset.url} download={asset.name}>Download</a>{onUse && <button type="button" className="primary" onClick={() => onUse(asset)}>Use {asset.type === 'model' ? 'model' : 'image'}</button>}</div>
    </footer>
  </dialog>
}
