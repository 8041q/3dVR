import React, { useEffect, useRef } from 'react'

export default function PublishReviewDialog({
  title, issues, warnings, checkingMedia, scenes, startSceneId, busy, error,
  onResolve, onPreview, onPublish, onClose,
}) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => { previous?.focus?.() }
  }, [])

  const start = scenes.find((scene) => scene.id === startSceneId)

  return (
    <dialog
      ref={dialog}
      className="publish-review"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
      aria-labelledby="publish-review-title"
    >
      <header>
        <h2 id="publish-review-title">Review &amp; publish</h2>
        <button onClick={onClose} disabled={busy} aria-label="Close publish review">×</button>
      </header>
      <p>Publishing saves this draft and updates the tour at your public visitor link.</p>
      <div className="publish-review__summary">
        <strong>{title || 'Untitled tour'}</strong>
        <span>{scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'} · {start ? `Starts in ${start.title}` : 'No starting scene'}</span>
      </div>
      {issues.length > 0 ? (
        <>
          <h3>Finish {issues.length === 1 ? 'this item' : `these ${issues.length} items`} before publishing</h3>
          <div className="project-issues">
            {issues.map((issue, index) => (
              issue.tool ? <button key={index} onClick={() => onResolve(issue)}>
                <span>{issue.message}</span><span aria-hidden="true">›</span>
              </button> : <p key={index} role="alert">{issue.message}</p>
            ))}
          </div>
        </>
      ) : !checkingMedia && <div className="editor-callout">
        Required settings and local media checks passed. Use Preview to test the complete visitor experience.
      </div>}
      {checkingMedia && <p role="status">Checking panorama sources and GLB files…</p>}
      {warnings.length > 0 && (
        <>
          <h3>Review before sharing</h3>
          <div className="project-issues">
            {warnings.map((issue, index) => (
              <button key={index} onClick={() => onResolve(issue)}>
                <span>{issue.message}</span><span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </>
      )}
      {error && <p role="alert" className="error-text">{error}</p>}
      <footer>
        <button onClick={onPreview} disabled={busy || !(start?.image || start?.panorama?.manifestUrl)}>Preview from start</button>
        <button className="primary" onClick={onPublish} disabled={busy || checkingMedia || issues.length > 0}>
          {busy ? 'Publishing…' : 'Publish & get link'}
        </button>
      </footer>
    </dialog>
  )
}
