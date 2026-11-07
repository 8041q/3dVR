import React from 'react'

function Icon({ name }) {
  const paths = {
    guides: <path d="M4 20V5m0 0 4-1 8 2 4-1v9l-4 1-8-2-4 1" />,
    play: <path d="m9 6 9 6-9 6z" fill="currentColor" stroke="none" />,
  }
  return <svg width={name === 'play' ? 12 : 16} height={name === 'play' ? 12 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function GuideLauncher({ guides, activeGuide, onStart }) {
  const playable = guides?.filter((guide) => guide.steps?.length) || []
  if (activeGuide || !playable.length) return null

  return (
    <details className="guide-launcher" data-viewer-chrome="bottom" onKeyDown={(event) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.currentTarget.open = false
      event.currentTarget.querySelector('summary')?.focus()
    }}>
      <summary>
        <Icon name="guides" />
        <span>Guides</span>
        {playable.length > 1 && <span className="guide-launcher__count" aria-label={`${playable.length} guides`}>{playable.length}</span>}
      </summary>
      <div className="guide-launcher__list">
        {playable.map((guide) => (
          <button type="button" key={guide.id} onClick={() => onStart(guide.id)}>
            <span className="guide-launcher__play"><Icon name="play" /></span>
            <span className="guide-launcher__text">
              <strong>{guide.title || guide.id}</strong>
              {guide.description && <span>{guide.description}</span>}
            </span>
          </button>
        ))}
      </div>
    </details>
  )
}