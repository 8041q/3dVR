import React from 'react'

export default function GuideOverlay({ guide, step, stepIndex, onPrevious, onNext, onExit, onPlayNarration }) {
  if (!guide || !step) return null

  const total = guide.steps?.length || 0

  return (
    <section className="guide-overlay" aria-label="Guided tour">
      <header>
        <div>
          <div className="guide-overlay__eyebrow">
            {guide.title || 'Guide'} · Step {stepIndex + 1} of {total}
          </div>
          <strong>{step.title || `Step ${stepIndex + 1}`}</strong>
        </div>
        <button type="button" onClick={onExit}>Exit</button>
      </header>

      {step.instruction && <p>{step.instruction}</p>}

      <div className="guide-overlay__progress" aria-hidden="true">
        <span style={{ width: `${total ? ((stepIndex + 1) / total) * 100 : 0}%` }} />
      </div>

      <div className="guide-overlay__actions">
        {step.narrationUrl && (
          <button type="button" onClick={onPlayNarration}>Narration</button>
        )}
        <button type="button" onClick={onPrevious} disabled={stepIndex === 0}>Previous</button>
        <button type="button" onClick={onNext}>
          {stepIndex >= total - 1 ? 'Finish' : 'Next'}
        </button>
      </div>
    </section>
  )
}
