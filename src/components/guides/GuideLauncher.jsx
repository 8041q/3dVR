import React from 'react'

export default function GuideLauncher({ guides, activeGuide, onStart }) {
  const playable = guides?.filter((guide) => guide.steps?.length) || []
  if (activeGuide || !playable.length) return null

  return (
    <details className="guide-launcher" data-viewer-chrome="bottom">
      <summary>Guides</summary>
      <div className="guide-launcher__list">
        {playable.map((guide) => (
          <button type="button" key={guide.id} onClick={() => onStart(guide.id)}>
            <strong>{guide.title || guide.id}</strong>
            {guide.description && <span>{guide.description}</span>}
          </button>
        ))}
      </div>
    </details>
  )
}
