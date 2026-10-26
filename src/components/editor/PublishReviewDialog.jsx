import React, { useEffect, useRef } from 'react'
import { ProjectIssues } from './WorkflowOverview'

export default function PublishReviewDialog({ title, issues, scenes, startSceneId, busy, error, onResolve, onPreview, onPublish, onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => { previous?.focus?.() }
  }, [])
  return (
    <dialog ref={dialog} className="publish-review" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }} aria-labelledby="publish-review-title">
      <header><div><div className="editor-eyebrow">Publish your tour</div><h2 id="publish-review-title">One last look.</h2></div><button onClick={onClose} disabled={busy} aria-label="Close publish review">×</button></header>
      <p>Publishing saves this draft and updates your public visitor link. You can keep editing afterwards.</p>
      <div className="publish-review__summary"><strong>{title}</strong><span>{scenes.length} scenes · Starts in {scenes.find((scene) => scene.id === startSceneId)?.title || 'an unselected scene'}</span></div>
      {issues.length ? <><h3>Finish these before publishing</h3><p>Choose an item to go straight to its editor.</p><ProjectIssues issues={issues} onResolve={onResolve} /></> : <div className="editor-callout">Your scenes and actions are configured. Preview the tour to check how it feels.</div>}
      {error && <p role="alert" className="error-text">{error}</p>}
      <footer><button onClick={onPreview} disabled={busy}>Preview draft ↗</button><button className="primary" onClick={onPublish} disabled={busy || issues.length > 0}>{busy ? 'Publishing…' : 'Publish & get link'}</button></footer>
    </dialog>
  )
}
