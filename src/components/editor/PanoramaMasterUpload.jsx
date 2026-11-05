import React, { useEffect, useEffectEvent, useRef, useState } from 'react'
import { panoramaFileIdentity, recoverCompletedUpload, samePanoramaFile, uploadPanoramaFile } from '../../uploads/resumablePanoramaUpload'
import { retryPanoramaJob, waitForPanoramaJob } from '../../uploads/panoramaJob'
import { useAuth } from '../../contexts/AuthContext'

const bytes = (value = 0) => value < 1024 ** 3
  ? `${(value / 1024 ** 2).toFixed(1)} MB`
  : `${(value / 1024 ** 3).toFixed(2)} GB`

function readTask(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}

function storeTask(key, task) {
  try {
    if (task) localStorage.setItem(key, JSON.stringify(task))
    else localStorage.removeItem(key)
  } catch {
    // The task can still resume in this view if browser storage is unavailable.
  }
}

export default function PanoramaMasterUpload({ projectId, sceneId, prepareApply }) {
  const { token } = useAuth()
  const key = `3dvr-panorama-task:${JSON.stringify([projectId, sceneId])}`
  const [task, setTask] = useState(() => readTask(key))
  const [file, setFile] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState(null)
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const active = useRef(null)
  const fileInput = useRef(null)
  const busy = ['checking', 'uploading', 'processing'].includes(phase)

  function updateTask(next) {
    setTask(next)
    storeTask(key, next)
  }

  function applyResult(result, apply) {
    if (!result?.manifestUrl) throw new Error('The processed panorama did not include a manifest.')
    const panorama = {
      kind: 'multires-cubemap',
      manifestUrl: result.manifestUrl,
      assetId: result.assetId,
      revision: result.revision,
    }
    if (apply({ panorama, image: '' })) {
      updateTask(null)
      setJob(null)
      setPhase('applied')
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
    } else {
      setPhase('ready')
    }
  }

  async function watch(jobId, signal, apply) {
    setPhase('processing')
    const result = await waitForPanoramaJob(jobId, { token, signal, onUpdate: setJob })
    signal.throwIfAborted()
    if (result.status === 'failed') {
      setError(result.error || 'Panorama processing failed.')
      setPhase('idle')
    } else if (apply) {
      applyResult(result.result, apply)
    } else {
      setPhase('ready')
    }
  }

  async function run(operation) {
    const controller = new AbortController()
    active.current = controller
    setError('')
    try {
      await operation(controller.signal)
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure.message || 'Could not continue the panorama task.')
        setPhase('idle')
      }
    } finally {
      if (active.current === controller) active.current = null
    }
  }

  const reopenTask = useEffectEvent(() => {
    if (!task?.uploadId) return
    void run(async (signal) => {
      if (task.jobId) {
        await watch(task.jobId, signal)
        return
      }
      setPhase('checking')
      const uploaded = await recoverCompletedUpload(task.uploadId, task.file.size, { token, signal })
      signal.throwIfAborted()
      if (uploaded) {
        updateTask({ ...task, jobId: uploaded.jobId })
        await watch(uploaded.jobId, signal)
      } else {
        setPhase('idle')
      }
    })
  })
  useEffect(() => {
    reopenTask()
    return () => active.current?.abort()
  }, [key, token])

  function start() {
    if (!file || busy) return
    const apply = prepareApply()
    setPhase('uploading')
    setProgress(null)
    void run(async (signal) => {
      const identity = await panoramaFileIdentity(file)
      signal.throwIfAborted()
      if (task?.uploadId && !samePanoramaFile(task.file, identity)) {
        throw new Error(`Choose the original file (${task.file.name}) to resume, or choose Start over.`)
      }
      const resumed = Boolean(task?.uploadId)
      const uploaded = await uploadPanoramaFile(file, {
        token,
        signal,
        uploadId: task?.uploadId,
        onSession: (uploadId) => updateTask({ file: identity, uploadId }),
        onProgress: setProgress,
      })
      signal.throwIfAborted()
      updateTask({ file: identity, uploadId: uploaded.uploadId, jobId: uploaded.jobId })
      await watch(uploaded.jobId, signal, resumed ? null : apply)
    })
  }

  function pause() {
    active.current?.abort()
    setPhase('idle')
  }

  function checkJob() {
    void run(async (signal) => {
      if (job?.status === 'failed') {
        setPhase('processing')
        setJob(await retryPanoramaJob(task.jobId, { token, signal }))
      }
      await watch(task.jobId, signal)
    })
  }

  function startOver() {
    if (task.jobId) setFile(null)
    updateTask(null)
    setJob(null)
    setError('')
    setPhase('idle')
  }

  return (
    <div className="master-upload-card">
      <p className="muted">
        Upload a large 2:1 JPEG, PNG or WebP. The editor converts it into tiles so visitors can load detail as they look around.
      </p>
      {!task?.jobId && (
        <label>
          {task?.uploadId ? 'Reselect the original file' : 'Panorama file'}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
            onChange={(event) => { setFile(event.target.files?.[0] || null); setError(''); setPhase('idle') }} />
        </label>
      )}
      {(file || task?.file) && <div className="muted">{file?.name || task.file.name} · {bytes(file?.size || task.file.size)}</div>}
      {phase === 'uploading' && (
        <>
          <progress aria-label="Panorama upload progress" value={progress?.progress || 0} max="1" />
          <div className="muted">Uploading {bytes(progress?.uploadedBytes || 0)} / {bytes(file?.size)}</div>
        </>
      )}
      {phase === 'processing' && (
        <>
          <progress aria-label="Panorama processing progress" value={job?.progress?.percent || 0} max="1" />
          <div className="muted">{!job || job.status === 'queued' ? 'Waiting for the panorama processor' : 'Creating panorama tiles'}</div>
        </>
      )}
      {phase === 'checking' && <p className="muted" role="status">Checking the saved upload…</p>}
      {phase === 'idle' && task?.uploadId && !task.jobId && <p className="muted">Upload paused. Select the original file to continue from its saved position.</p>}
      {phase === 'idle' && task?.jobId && job?.status !== 'failed' && <p className="muted">Processing runs on the server. You can check its progress again at any time.</p>}
      {phase === 'ready' && <p className="success" role="status">The tiled panorama is ready to apply.</p>}
      {phase === 'applied' && <p className="success" role="status">Processed panorama applied to this scene.</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="button-row">
        {!task?.jobId && !busy && <button type="button" onClick={start} disabled={!file}>{task?.uploadId ? 'Resume upload' : 'Upload and apply'}</button>}
        {phase === 'uploading' && <button type="button" onClick={pause}>Pause upload</button>}
        {phase === 'processing' && <button type="button" onClick={pause}>Stop watching</button>}
        {task?.jobId && phase === 'idle' && (
          <button type="button" onClick={checkJob}>{job?.status === 'failed' ? 'Retry processing' : 'Check processing'}</button>
        )}
        {phase === 'ready' && <button type="button" onClick={() => applyResult(job.result, prepareApply())}>Apply panorama</button>}
        {task && !busy && <button type="button" onClick={startOver}>Start over</button>}
      </div>
    </div>
  )
}
