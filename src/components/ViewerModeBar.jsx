import React from 'react'

export default function ViewerModeBar({
  mode,
  onPC,
  onPhone,
  onVR,
  vrAvailable,
  vrReason,
  phoneHeadset,
  onTogglePhoneHeadset,
  motionActive,
}) {
  return (
    <div className="mode-bar-wrap">
      <div className="mode-bar">
        <button onClick={onPC} disabled={mode === 'pc'}>PC</button>
        <button onClick={onPhone} disabled={mode === 'phone'}>Phone</button>
        <button
          onClick={onVR}
          disabled={mode === 'vr'}
          title={vrAvailable ? 'VR Preview' : vrReason}
        >
          VR Preview
        </button>
      </div>

      {mode === 'phone' && (
        <div className="phone-tools">
          <button
            className={phoneHeadset ? 'active' : ''}
            onClick={onTogglePhoneHeadset}
          >
            {phoneHeadset ? 'Exit phone headset' : 'Phone headset'}
          </button>
          <span>{motionActive ? 'Motion active' : 'Motion unavailable'}</span>
        </div>
      )}
    </div>
  )
}
