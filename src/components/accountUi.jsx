import React, { useEffect, useState } from 'react'
import { hasNoticeContent } from '../noticeContent'

export function Notice({ children, error = false }) {
  if (!hasNoticeContent(children)) return null
  return <div className={`account-notice${error ? ' account-notice--error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>
}

export function CopyButton({ value, label = 'Copy' }) {
  const [message, setMessage] = useState('')
  useEffect(() => setMessage(''), [value])
  async function copy() {
    try { await navigator.clipboard.writeText(value); setMessage('Copied') }
    catch { setMessage('Select the text to copy') }
  }
  return <button type="button" onClick={copy}>{message || label}</button>
}

export function PasswordField({ label, value, onChange, autoComplete = 'current-password', minLength, id }) {
  const [visible, setVisible] = useState(false)
  return <div className="account-field"><label htmlFor={id}>{label}</label>
    <span className="account-password"><input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required minLength={minLength} maxLength={128} value={value} onChange={onChange} /><button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button></span>
  </div>
}

// Round profile picture. Falls back to the person's initial when there is no
// photo or the photo fails to load.
export function Avatar({ name = '', src = null, size = 32 }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  const initial = (Array.from(String(name).trim())[0] || 'U').toUpperCase()
  return <span className="account-user-avatar" style={{ '--avatar-size': `${size}px` }} aria-hidden="true">
    {src && !failed ? <img src={src} alt="" draggable={false} onError={() => setFailed(true)} /> : initial}
  </span>
}

export function PanelHeading({ id, title, description, children }) {
  return <div className="account-panel-heading"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div>{children}</div>
}