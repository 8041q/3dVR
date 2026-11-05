import React, { useEffect, useRef, useState } from 'react'
import {
  PHONE_VIEW_MODES,
  normalizePhoneViewProfile,
  opticalFovEstimateDeg,
  resetPhoneViewProfile,
} from '../phoneViewProfile'

function Range({ label, value, min, max, step, unit = '', onChange }) {
  const digits = Math.max(String(step).split('.')[1]?.length || 0, String(min).split('.')[1]?.length || 0)
  const display = `${Number(value).toFixed(digits)}${unit}`
  return (
    <label className="phone-calibration__range">
      <span>{label}<span className="phone-calibration__value" aria-hidden="true">{display}</span></span>
      <input type="range" min={min} max={max} step={step} value={value}
        aria-valuetext={display} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

export default function PhoneCalibrationPanel({
  open, profile, onPreview, onSave, onCancel, onRecenter, motionStatus,
}) {
  const [draft, setDraft] = useState(() => normalizePhoneViewProfile(profile))
  const latest = useRef(draft)
  const cancel = useRef(null)

  useEffect(() => {
    if (!open) return
    const next = normalizePhoneViewProfile(profile)
    latest.current = next
    setDraft(next)
  }, [open, profile])

  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    cancel.current?.focus()
    return () => opener?.focus?.()
  }, [open])

  function apply(profile) {
    const next = normalizePhoneViewProfile(profile)
    latest.current = next
    setDraft(next)
    onPreview?.(next)
  }

  const update = (patch) => apply({ ...latest.current, ...patch })
  if (!open) return null

  const motionActive = motionStatus?.status === 'active'
  const motionText = motionActive ? 'Motion active' : motionStatus?.detail || 'Motion is not active yet.'

  return (
    <div className="phone-calibration">
      <div className="phone-calibration__backdrop" />
      <section className="phone-calibration__panel" role="dialog" aria-labelledby="phone-calibration-title" aria-modal="true"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onCancel?.()
            return
          }
          if (event.key !== 'Tab') return
          const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled), input, summary')]
            .filter((control) => control.getClientRects().length)
          const first = focusable[0]
          const last = focusable.at(-1)
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}>
        <header>
          <div>
            <p className="phone-calibration__eyebrow">Live preview</p>
            <h2 id="phone-calibration-title">Phone VR calibration</h2>
          </div>
          <button ref={cancel} type="button" onClick={onCancel}>Cancel</button>
        </header>

        <div className="phone-calibration__scroll">
          <section>
            <h3>View</h3>
              <Range label="Field of view" value={draft.fovDeg} min={35} max={120} step={1} unit="°" onChange={(fovDeg) => update({ fovDeg })} />
          </section>
          {draft.mode === PHONE_VIEW_MODES.HEADSET_STEREO && (
            <section>
              <h3>Phone viewer fit</h3>
              <p className="phone-calibration__hint">Adjust the split-screen view to match your phone headset.</p>
              <Range label="Lens spacing (IPD)" value={draft.ipdMm} min={45} max={90} step={0.5} unit=" mm" onChange={(ipdMm) => update({ ipdMm })} />
              <Range label="Visible screen width" value={draft.renderWidthPercent} min={55} max={100} step={1} unit="%" onChange={(renderWidthPercent) => update({ renderWidthPercent })} />
            </section>
          )}

          <section>
            <h3>Orientation</h3>
            <p className="phone-calibration__status" role="status">{motionText}</p>
            <div className="button-row">
              <button type="button" onClick={onRecenter}>Recenter view</button>
            </div>
          </section>

          {draft.mode === PHONE_VIEW_MODES.HEADSET_STEREO && (
            <section>
              <details className="phone-calibration__advanced">
                <summary>Advanced phone viewer settings</summary>
                <h4>Depth and rendering</h4>
                <label className="phone-calibration__check">
                  <input type="checkbox" checked={draft.stereoscopic}
                    onChange={(event) => update({ stereoscopic: event.target.checked })} />
                  Render separate views for each eye
                </label>
                <Range label="Focus distance" value={draft.focusDistanceM} min={0.25} max={30} step={0.25} unit=" m" onChange={(focusDistanceM) => update({ focusDistanceM })} />
                <Range label="Eye alignment trim" value={draft.convergenceTrim} min={-1} max={1} step={0.05} onChange={(convergenceTrim) => update({ convergenceTrim })} />
                <h4>Screen and lens alignment</h4>
                <Range label="Physical screen width" value={draft.screenWidthMm} min={90} max={220} step={1} unit=" mm" onChange={(screenWidthMm) => update({ screenWidthMm })} />
                <Range label="Screen-to-lens distance" value={draft.screenToLensMm} min={20} max={80} step={0.5} unit=" mm" onChange={(screenToLensMm) => update({ screenToLensMm })} />
                <p className="phone-calibration__hint">Estimated field of view from these measurements: {Math.round(opticalFovEstimateDeg(draft))}° per eye.</p>
                <Range label="Left-eye share of screen" value={draft.stereoSplitPercent} min={42} max={58} step={0.25} unit="%" onChange={(stereoSplitPercent) => update({ stereoSplitPercent })} />
                <Range label="Gap between views" value={draft.centerGapPx} min={0} max={80} step={1} unit=" px" onChange={(centerGapPx) => update({ centerGapPx })} />
                <Range label="Lens center offset" value={draft.lensCenterOffsetPercent} min={-12} max={12} step={0.25} unit="%" onChange={(lensCenterOffsetPercent) => update({ lensCenterOffsetPercent })} />
              </details>
            </section>
          )}

        </div>

        <footer>
          <button type="button" onClick={() => apply(resetPhoneViewProfile(latest.current))}>Reset settings</button>
          <button type="button" className="primary" onClick={() => onSave?.(latest.current)}>Save settings</button>
        </footer>
      </section>
    </div>
  )
}
