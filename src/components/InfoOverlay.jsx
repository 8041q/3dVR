import React from 'react'

export default function InfoOverlay({ info, onClose }) {
  if (!info) return null

  return (
    <div className="info-overlay" role="dialog" aria-modal="false" aria-label={info.title || 'Information'}>
      <div className="info-overlay__card">
        <header>
          <strong>{info.title || 'Information'}</strong>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        {info.body && <p>{info.body}</p>}
      </div>
    </div>
  )
}
