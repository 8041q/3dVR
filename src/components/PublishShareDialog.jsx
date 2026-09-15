import React, { useMemo, useState } from 'react'
import { createQrSvg } from '../share/qrCode'

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function PublishShareDialog({
  projectId,
  projectTitle,
  sceneCount = 0,
  guideCount = 0,
  startSceneTitle,
  revision,
  publishedAt,
  onClose,
}) {
  const [copied, setCopied] = useState('')
  const shareUrl = `${window.location.origin}/v/${encodeURIComponent(projectId)}`
  const qrSvg = useMemo(() => createQrSvg(shareUrl, { moduleSize: 5 }), [shareUrl])

  async function copy(value, label) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied(''), 1800)
    } catch {
      setCopied('Copy failed')
    }
  }

  async function nativeShare() {
    if (!navigator.share) return
    try {
      await navigator.share({
        title: projectTitle || '3DVR presentation',
        text: `Open ${projectTitle || 'this 3DVR presentation'}`,
        url: shareUrl,
      })
    } catch {
      // The share sheet can be dismissed without it being an application error.
    }
  }

  return (
    <div className="modal-backdrop publish-share-backdrop" onMouseDown={onClose}>
      <section className="publish-share-dialog publish-share-dialog--dense" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <div className="editor-eyebrow">Published successfully</div>
            <h2>{projectTitle || 'Presentation'} is live</h2>
            <p>The published revision is separate from your draft. You can keep editing after closing this window.</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>

        <div className="publish-share-layout">
          <div className="publish-share-scan-card">
            <div className="publish-share-scan-card__heading">
              <strong>Scan to open</strong>
              <span>Phone or headset browser</span>
            </div>
            <div className="publish-share-dialog__qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <button
              type="button"
              onClick={() => downloadText(
                `3dvr-${projectId}-qr.svg`,
                qrSvg,
                'image/svg+xml;charset=utf-8',
              )}
            >
              Download QR
            </button>
          </div>

          <div className="publish-share-main">
            <div className="publish-share-link-card">
              <div className="publish-share-link-card__heading">
                <div>
                  <span>Public URL</span>
                  <strong>Ready to share</strong>
                </div>
                <span className="status-pill status-pill--success">Live</span>
              </div>

              <div className="copy-field copy-field--large">
                <input readOnly value={shareUrl} aria-label="Published viewer URL" />
                <button type="button" onClick={() => copy(shareUrl, 'Link copied')}>Copy link</button>
              </div>

              <div className="publish-share-action-grid">
                <a className="button-link primary" href={shareUrl} target="_blank" rel="noreferrer">
                  Open viewer
                </a>
                {navigator.share && <button type="button" onClick={nativeShare}>Share</button>}
                <button type="button" onClick={() => copy(shareUrl, 'Link copied')}>Copy URL</button>
                <button type="button" onClick={onClose}>Continue editing</button>
              </div>
            </div>

            <div className="publish-share-stats" aria-label="Published presentation details">
              <div>
                <span>Scenes</span>
                <strong>{sceneCount}</strong>
              </div>
              <div>
                <span>Guides</span>
                <strong>{guideCount}</strong>
              </div>
              <div>
                <span>Start scene</span>
                <strong title={startSceneTitle}>{startSceneTitle || 'Not set'}</strong>
              </div>
              <div>
                <span>Revision</span>
                <strong title={revision}>{revision ? String(revision).slice(0, 10) : '-'}</strong>
              </div>
            </div>

            <div className="publish-share-notes">
              <div>
                <strong>For an exhibition headset</strong>
                <span>Open this link on the headset, then use Download project in the viewer to keep the published project available offline.</span>
              </div>
              <div>
                <strong>Published copy is protected</strong>
                <span>New editor changes remain in Draft until you publish again.</span>
              </div>
            </div>

            <div className="publish-share-footer-meta">
              {publishedAt && <span>Published {new Date(publishedAt).toLocaleString()}</span>}
              <span>Project ID: {projectId}</span>
              {copied && <span className="success">{copied}</span>}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
