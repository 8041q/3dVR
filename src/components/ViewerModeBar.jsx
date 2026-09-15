import React from 'react'
import { PHONE_VIEW_MODES } from '../phoneViewProfile'

function motionLabel(state) {
  const status = state?.status || 'inactive'
  if (status === 'active') return 'Motion active · 2 s gaze select'
  if (status === 'insecure') return 'Motion blocked · HTTPS required'
  if (status === 'denied') return 'Motion permission denied'
  if (status === 'unsupported') return 'Motion sensor unavailable'
  if (status === 'waiting') return 'Waiting for phone motion…'
  if (status === 'error') return 'Motion error'
  return '2 s gaze select'
}

function phoneModeLabel(mode) {
  if (mode === PHONE_VIEW_MODES.HEADSET_STEREO) return 'Headset stereo'
  if (mode === PHONE_VIEW_MODES.DOLLHOUSE) return 'Dollhouse'
  return 'Magic window'
}

export default function ViewerModeBar({
  mode,
  onPC,
  onPhone,
  onVR,
  vrAvailable,
  vrReason,
  phoneHeadset,
  phoneViewMode,
  onEnterPhoneHeadset,
  onOpenPhoneCalibration,
  phoneMotionStatus,
  onEnablePhoneMotion,
  onRecenterPhone,
  xrTracking,
  spatialAvailable,
}) {
  const motionNeedsHelp = mode === 'phone' && phoneMotionStatus?.status !== 'active'

  return (
    <div className="mode-bar-wrap">
      <div className="mode-bar">
        <button onClick={onPC} disabled={mode === 'pc'}>PC</button>
        <button onClick={onPhone} disabled={mode === 'phone'}>Phone</button>
        <button onClick={onVR} disabled={mode === 'vr'} title={vrAvailable ? 'VR Preview' : vrReason}>VR Preview</button>
      </div>

      {mode === 'phone' && (
        <div className="phone-tools phone-tools--diagnostic">
          {!phoneHeadset && <button type="button" onClick={onEnterPhoneHeadset}>Headset stereo</button>}
          <button type="button" className="active" onClick={onOpenPhoneCalibration}>Calibrate view</button>
          <button type="button" onClick={onRecenterPhone}>Recenter view</button>
          {motionNeedsHelp && <button type="button" onClick={onEnablePhoneMotion}>Enable motion</button>}
          <span>{phoneModeLabel(phoneViewMode)} · <span title={phoneMotionStatus?.detail || ''}>{motionLabel(phoneMotionStatus)}</span></span>
        </div>
      )}

      {mode === 'vr' && (
        <div className="phone-tools">
          <span>
            {xrTracking === 'tracked'
              ? spatialAvailable ? 'Tracked VR · spatial room' : 'Tracked VR · panorama fallback'
              : xrTracking === 'rotation-only'
                ? 'Rotation-only VR · panorama fallback'
                : 'Checking headset tracking...'}
          </span>
        </div>
      )}
    </div>
  )
}
