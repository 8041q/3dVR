import Select from './ui/Select'
import React, { useId } from 'react'

function Icon({ name }) {
  const paths = {
    drag: <><path d="M8 12V5a2 2 0 0 1 4 0v6m0-2a2 2 0 0 1 4 0v3m0-2a2 2 0 0 1 4 0v5c0 4-2 7-6 7h-1c-2 0-3-1-4-2l-4-5a2 2 0 0 1 3-2l2 2" /></>,
    motion: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2M3 7l-2 3 3 1m-1-1a10 10 0 0 1 2-6m16 13 2-3-3-1m1 1a10 10 0 0 1-2 6" /></>,
    recenter: <><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" /></>,
    calibrate: <><path d="M4 7h16M4 17h16M8 4v6M16 14v6" /></>,
    vr: <><rect x="3" y="7" width="18" height="11" rx="4" /><path d="m10 18 2-3 2 3M3 11H1m22 0h-2" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></>,
  }
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function motionMessage(state) {
  switch (state?.status) {
    case 'active': return 'Move your phone to look around.'
    case 'denied': return 'Allow motion sensors in your browser’s site settings, then select Phone VR again.'
    case 'insecure': return 'Motion needs a secure link (https://). Drag still works.'
    case 'unsupported': return 'No motion sensor is available on this device. Use Drag to look around.'
    case 'error': return 'Motion could not start. Select Phone VR to try again, or use Drag.'
    default: return state?.detail || 'Move your phone to start looking around.'
  }
}

export default function ViewerModeBar({
  mode, onPC, onPhone, onVR, vrAvailable, vrReason, vrChecking, vrPending, phoneHeadset,
  onEnterPhoneHeadset, onExitPhoneHeadset, onOpenPhoneCalibration,
  phoneMotionStatus, onRecenterPhone,
}) {
  const reasonId = useId()
  const status = phoneMotionStatus?.status || 'waiting'
  const active = status === 'active'
  return (
    <div className="mode-bar-wrap viewer-controls" data-viewer-chrome="bottom">
      <div className="viewer-controls__bar">
        <div className="mode-bar" role="group" aria-label="View mode">
          <button type="button" onClick={onPC} aria-pressed={mode === 'pc'}><Icon name="drag" />Drag</button>
          <button type="button" onClick={onPhone} aria-pressed={mode === 'phone'}><Icon name="motion" />Phone VR</button>
          <button type="button" className="viewer-controls__vr" aria-pressed={mode === 'vr'}
            aria-describedby={mode !== 'vr' ? reasonId : undefined}
            disabled={mode !== 'vr' && (!vrAvailable || vrChecking || vrPending)}
            onClick={mode === 'vr' ? onPC : onVR}><Icon name="vr" />{mode === 'vr' ? 'Exit VR' : vrPending ? 'Entering VR…' : 'VR Headset'}</button>
        </div>
        {mode === 'phone' && <div className="viewer-controls__display">
          <Select aria-label="Phone VR display" value={phoneHeadset ? 'headset' : 'phone'}
            onChange={(event) => event.target.value === 'headset' ? onEnterPhoneHeadset() : onExitPhoneHeadset()}>
            <option value="phone">Single view</option><option value="headset">Split screen</option>
          </Select>
          <button type="button" className="viewer-controls__icon" aria-label="Recenter view" title="Recenter view" onClick={onRecenterPhone}><Icon name="recenter" /></button>
          <button type="button" className="viewer-controls__icon" aria-label="Calibrate phone" title="Calibrate phone" onClick={onOpenPhoneCalibration}><Icon name="calibrate" /></button>
          <details className="viewer-controls__help" onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); event.stopPropagation() } }}>
            <summary aria-label={active ? 'Gyroscope status' : 'Motion unavailable — details'} title={active ? 'Gyroscope active' : 'Motion status'}><span className={`viewer-controls__dot${active ? ' is-active' : ''}`} /><Icon name="info" /></summary>
            <div className="viewer-controls__help-panel" role="status" data-motion-status={status}><strong>{active ? 'Gyroscope active' : status === 'waiting' ? 'Waiting for motion' : 'Motion unavailable'}</strong><p>{motionMessage(phoneMotionStatus)}</p></div>
          </details>
        </div>}

      </div>
      {mode !== 'vr' && <p id={reasonId} className="viewer-controls__availability" role="status">{vrPending ? 'Starting your VR headset session…' : vrReason}</p>}
    </div>
  )
}
