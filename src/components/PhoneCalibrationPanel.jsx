import React, { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_PHONE_VIEW_PROFILE,
  PHONE_VIEW_MODES,
  normalizePhoneViewProfile,
  opticalFovEstimateDeg,
} from '../phoneViewProfile'

function Range({ label, value, min, max, step, unit = '', onChange }) {
  return (
    <label className="phone-calibration__range">
      <span>{label}<strong>{Number(value).toFixed(step < 1 ? 1 : 0)}{unit}</strong></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export default function PhoneCalibrationPanel({
  open,
  profile,
  spatialAvailable,
  onPreview,
  onSave,
  onCancel,
  onRecenter,
  onEnableMotion,
  motionStatus,
}) {
  const [draft, setDraft] = useState(() => normalizePhoneViewProfile(profile))

  useEffect(() => {
    if (!open) return
    setDraft(normalizePhoneViewProfile(profile))
  }, [open, profile])

  const update = (patch) => {
    setDraft((current) => {
      const next = normalizePhoneViewProfile({ ...current, ...patch })
      onPreview?.(next)
      return next
    })
  }

  const estimatedFov = useMemo(() => opticalFovEstimateDeg(draft), [draft])
  if (!open) return null

  const motionText = motionStatus?.status === 'active'
    ? 'Motion active'
    : motionStatus?.detail || 'Motion is not active yet.'

  return (
    <div className="phone-calibration" role="dialog" aria-modal="true" aria-label="Phone view calibration">
      <div className="phone-calibration__backdrop" />
      <section className="phone-calibration__panel">
        <header>
          <div>
            <strong>Phone view calibration</strong>
            <p>Adjust while watching the live scene. Save only when it feels comfortable.</p>
          </div>
          <button type="button" onClick={onCancel}>Close</button>
        </header>

        <div className="phone-calibration__mode-grid">
          <button
            type="button"
            className={draft.mode === PHONE_VIEW_MODES.MAGIC_WINDOW ? 'active' : ''}
            onClick={() => update({ mode: PHONE_VIEW_MODES.MAGIC_WINDOW })}
          >
            <strong>Magic Window</strong>
            <span>Mono panorama · gyro + optional touch look</span>
          </button>
          <button
            type="button"
            className={draft.mode === PHONE_VIEW_MODES.HEADSET_STEREO ? 'active' : ''}
            onClick={() => update({ mode: PHONE_VIEW_MODES.HEADSET_STEREO })}
          >
            <strong>Headset Stereo</strong>
            <span>Split screen · gyro · 2 s gaze</span>
          </button>
          <button
            type="button"
            disabled={!spatialAvailable}
            title={spatialAvailable ? 'Preview the Blender room as a miniature' : 'Import a Blender spatial room first'}
            className={draft.mode === PHONE_VIEW_MODES.DOLLHOUSE ? 'active' : ''}
            onClick={() => spatialAvailable && update({ mode: PHONE_VIEW_MODES.DOLLHOUSE })}
          >
            <strong>Dollhouse</strong>
            <span>{spatialAvailable ? 'Miniature Blender room' : 'No Blender room in this scene'}</span>
          </button>
        </div>

        <div className="phone-calibration__scroll">
          <section>
            <h3>Orientation</h3>
            <p className="phone-calibration__status">{motionText}</p>
            <div className="button-row">
              <button type="button" onClick={onRecenter}>Re-center / orientation reset</button>
              {motionStatus?.status !== 'active' && <button type="button" onClick={onEnableMotion}>Enable motion</button>}
            </div>
            {draft.mode === PHONE_VIEW_MODES.MAGIC_WINDOW && (
              <label className="phone-calibration__check">
                <input
                  type="checkbox"
                  checked={draft.touchLookEnabled}
                  onChange={(event) => update({ touchLookEnabled: event.target.checked })}
                />
                Allow touch drag to fine-tune the view
              </label>
            )}
          </section>

          {draft.mode === PHONE_VIEW_MODES.HEADSET_STEREO && (
            <>
              <section>
                <h3>Stereo optics</h3>
                <label className="phone-calibration__check">
                  <input
                    type="checkbox"
                    checked={draft.stereoscopic}
                    onChange={(event) => update({ stereoscopic: event.target.checked })}
                  />
                  Stereoscopic rendering
                </label>
                <Range label="IPD / lens spacing" value={draft.ipdMm} min={45} max={90} step={0.5} unit=" mm" onChange={(ipdMm) => update({ ipdMm })} />
                <Range label="Focus distance" value={draft.focusDistanceM} min={0.25} max={30} step={0.25} unit=" m" onChange={(focusDistanceM) => update({ focusDistanceM })} />
                <Range label="Focus / convergence trim" value={draft.convergenceTrim} min={-1} max={1} step={0.05} onChange={(convergenceTrim) => update({ convergenceTrim })} />
                <Range label="Field of view" value={draft.fovDeg} min={35} max={120} step={1} unit="°" onChange={(fovDeg) => update({ fovDeg })} />
                <div className="phone-calibration__hint">Physical estimate from screen/lens values: ~{estimatedFov.toFixed(0)}° per eye. Software cannot provide a true optical diopter adjustment; convergence trim is the safe digital equivalent.</div>
              </section>

              <section>
                <h3>Phone / headset fit</h3>
                <Range label="Screen width" value={draft.screenWidthMm} min={90} max={220} step={1} unit=" mm" onChange={(screenWidthMm) => update({ screenWidthMm })} />
                <Range label="Screen-to-lens distance" value={draft.screenToLensMm} min={20} max={80} step={0.5} unit=" mm" onChange={(screenToLensMm) => update({ screenToLensMm })} />
                <Range label="Rendered screen size" value={draft.renderWidthPercent} min={55} max={100} step={1} unit="%" onChange={(renderWidthPercent) => update({ renderWidthPercent })} />
                <Range label="Stereo split" value={draft.stereoSplitPercent} min={42} max={58} step={0.25} unit="% left" onChange={(stereoSplitPercent) => update({ stereoSplitPercent })} />
                <Range label="Center gap" value={draft.centerGapPx} min={0} max={80} step={1} unit=" px" onChange={(centerGapPx) => update({ centerGapPx })} />
                <Range label="Lens center offset" value={draft.lensCenterOffsetPercent} min={-12} max={12} step={0.25} unit="%" onChange={(lensCenterOffsetPercent) => update({ lensCenterOffsetPercent })} />
              </section>
            </>
          )}

          {draft.mode === PHONE_VIEW_MODES.DOLLHOUSE && (
            <section>
              <h3>Dollhouse</h3>
              <Range label="Miniature size" value={draft.dollhouseScale} min={0.35} max={2} step={0.05} onChange={(dollhouseScale) => update({ dollhouseScale })} />
              <div className="phone-calibration__hint">Dollhouse is a phone-only inspection preview of the Blender room. It is not used for panorama viewing or tracked VR.</div>
            </section>
          )}
        </div>

        <footer>
          <button
            type="button"
            onClick={() => {
              const reset = normalizePhoneViewProfile(DEFAULT_PHONE_VIEW_PROFILE)
              setDraft(reset)
              onPreview?.(reset)
            }}
          >Reset defaults</button>
          <span>Live preview is active</span>
          <button type="button" className="primary" onClick={() => onSave?.(draft)}>Save profile</button>
        </footer>
      </section>
    </div>
  )
}
