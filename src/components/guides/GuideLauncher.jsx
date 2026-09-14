import React from 'react'

export default function GuideLauncher({ guides, activeGuide, onStart }) {
  if (activeGuide || !guides?.length) return null

  return (
    <details className="guide-launcher">
      <summary>Guides</summary>
      <div className="guide-launcher__list">
        {guides.map((guide) => (
          <button type="button" key={guide.id} onClick={() => onStart(guide.id)}>
            <strong>{guide.title || guide.id}</strong>
            {guide.description && <span>{guide.description}</span>}
          </button>
        ))}
      </div>
    </details>
  )
}
