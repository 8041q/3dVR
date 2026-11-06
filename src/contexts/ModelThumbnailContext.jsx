import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { InteractionProvider } from './InteractionContext'
import ProductInspector3D from '../components/product/ProductInspector3D'
import ThumbnailCapture from '../components/editor/ModelThumbnailCapture'

const Context = createContext(null)

class ThumbnailBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { this.props.onFailure(error.message) }
  render() { return this.state.failed ? null : this.props.children }
}

function ThumbnailJob({ job, onComplete }) {
  const [ready, setReady] = useState(false)
  const done = useRef(false)
  const request = useRef(new AbortController())
  const localUrl = useMemo(() => job.file ? URL.createObjectURL(job.file) : null, [job.file])
  const inspection = useMemo(() => ({ id: job.key, modelUrl: localUrl || job.url, rotationY: -35, viewer: { startPitch: 18 } }), [job.key, job.url, localUrl])
  const finish = useCallback((result, error) => {
    if (done.current) return
    done.current = true
    onComplete(job, result, error)
  }, [job, onComplete])
  const onStatus = useCallback(status => {
    if (status.state === 'ready') setReady(true)
    if (status.state === 'error') finish(null, status.error || 'Model could not be loaded.')
  }, [finish])
  const capture = useCallback(async blob => {
    if (!blob) return finish(null, 'Thumbnail capture failed.')
    try {
      const response = await fetch(`/api/assets/model-thumbnail?url=${encodeURIComponent(job.url)}&v=${encodeURIComponent(job.updatedAt)}`, {
        method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob, signal: request.current.signal,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Thumbnail could not be saved.')
      finish(body.thumbnailUrl)
    } catch (error) { if (!request.current.signal.aborted) finish(null, error.message) }
  }, [job, finish])
  useEffect(() => {
    const abort = request.current
    const timeout = setTimeout(() => { abort.abort(); finish(null, 'Thumbnail generation timed out.') }, 180000)
    return () => { clearTimeout(timeout); abort.abort(); if (localUrl) URL.revokeObjectURL(localUrl) }
  }, [finish, localUrl])
  return <div className="studio-thumbnail-worker" aria-hidden="true">
    <InteractionProvider><Canvas dpr={1} gl={{ preserveDrawingBuffer: true }} camera={{ fov: 45 }}>
      <ProductInspector3D standalone showControls={false} showAnnotations={false} directManipulation={false} inspection={inspection} onStatusChange={onStatus} />
      <ThumbnailCapture ready={ready} onCapture={capture} />
    </Canvas></InteractionProvider>
  </div>
}

export function ModelThumbnailProvider({ children }) {
  const [jobs, setJobs] = useState([])
  const [results, setResults] = useState({})
  const seen = useRef(new Set())
  const enqueue = useCallback((asset, file, retry = false) => {
    if (asset.type !== 'model' || asset.thumbnailUrl || !asset.updatedAt) return
    const key = `${asset.url}:${asset.updatedAt}`
    if (seen.current.has(key) && !retry) return
    seen.current.add(key)
    setResults(current => ({ ...current, [asset.url]: { version: asset.updatedAt, state: 'queued' } }))
    setJobs(current => current.some(job => job.key === key) ? current : [...current, { ...asset, file, key }])
  }, [])
  const complete = useCallback((job, thumbnailUrl, error) => {
    setResults(current => ({ ...current, [job.url]: { version: job.updatedAt, state: error ? 'error' : 'ready', thumbnailUrl, error } }))
    setJobs(current => current.filter(item => item.key !== job.key))
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    fetch('/api/assets', { signal: abort.signal }).then(response => response.ok ? response.json() : []).then(assets => {
      if (!abort.signal.aborted) assets.forEach(asset => enqueue(asset))
    }).catch(() => {})
    return () => abort.abort()
  }, [enqueue])
  const value = useMemo(() => ({ enqueue, results, activeUrl: jobs[0]?.url }), [enqueue, results, jobs])
  return <Context.Provider value={value}>{children}{jobs[0] && <ThumbnailBoundary key={jobs[0].key} onFailure={error => complete(jobs[0], null, error)}><ThumbnailJob job={jobs[0]} onComplete={complete} /></ThumbnailBoundary>}</Context.Provider>
}

export function useModelThumbnails() { return useContext(Context) }
