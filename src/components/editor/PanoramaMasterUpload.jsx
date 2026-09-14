import React, { useRef, useState } from 'react'
import { uploadPanoramaFile } from '../../uploads/resumablePanoramaUpload'
import { waitForPanoramaJob } from '../../uploads/panoramaJob'
import { useAuth } from '../../contexts/AuthContext'

const bytes = (value = 0) => value < 1024 ** 3 ? `${(value / 1024 ** 2).toFixed(1)} MB` : `${(value / 1024 ** 3).toFixed(2)} GB`

export default function PanoramaMasterUpload({ onUseProcessed }) {
  const { token } = useAuth()
  const [file, setFile] = useState(null)
  const [state, setState] = useState('idle')
  const [progress, setProgress] = useState(null)
  const [job, setJob] = useState(null)
  const [processed, setProcessed] = useState(null)
  const [error, setError] = useState('')
  const abort = useRef(null)

  async function start() {
    if (!file) return
    const controller = new AbortController(); abort.current = controller
    setError(''); setProcessed(null); setState('uploading')
    try {
      const uploaded = await uploadPanoramaFile(file, { token, signal: controller.signal, onProgress: setProgress })
      setState('processing')
      const complete = await waitForPanoramaJob(uploaded.jobId, { signal: controller.signal, onUpdate: setJob })
      const panorama = { kind: 'multires-cubemap', manifestUrl: complete.result.manifestUrl, assetId: complete.result.assetId, revision: complete.result.revision }
      setProcessed(panorama); setState('complete')
    } catch (e) {
      setError(e.name === 'AbortError' ? 'Cancelled.' : e.message); setState(e.name === 'AbortError' ? 'idle' : 'error')
    } finally { abort.current = null }
  }

  return <details className="floating-card master-upload"><summary>Master panorama upload</summary><p>Upload a 2:1 equirectangular JPEG/PNG/WebP. Large files are sent in resumable chunks and processed into VR-safe tiles.</p><input type="file" accept="image/jpeg,image/png,image/webp" disabled={state==='uploading'||state==='processing'} onChange={(e)=>{setFile(e.target.files?.[0]||null);setError('');setProcessed(null);setState('idle')}}/>{file&&<div className="muted">{file.name} - {bytes(file.size)}</div>}{state==='uploading'&&<><progress value={progress?.progress||0} max="1"/><div className="muted">Uploading {bytes(progress?.uploadedBytes||0)} / {bytes(file.size)}</div></>}{state==='processing'&&<><progress value={job?.progress?.percent||0} max="1"/><div className="muted">Processing {job?.progress?.stage||'starting'} {job?.progress?.face||''}</div></>}{processed&&<div className="success">Processed panorama ready</div>}{error&&<div className="error-text">{error}</div>}<div className="button-row"><button onClick={start} disabled={!file||state==='uploading'||state==='processing'}>Upload master</button>{(state==='uploading'||state==='processing')&&<button onClick={()=>abort.current?.abort()}>Cancel</button>}{processed&&<button onClick={()=>onUseProcessed?.(processed)}>Use in current scene</button>}</div></details>
}
