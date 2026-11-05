import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
export default function LoginModal({ onClose }) {
  const { login } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try { await login(password); onClose?.() }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal editor-login" role="dialog" aria-modal="true" aria-labelledby="editor-login-title" onSubmit={submit}>
        <div className="editor-eyebrow">
          <img src="/brand/3dvr-portal-v2.svg" alt="" width="40" height="40" />
          <span>Atria 3DVR · Tour editor</span>
        </div>
        <h2 id="editor-login-title">Let’s build your tour.</h2>
        <p>Sign in to arrange scenes, add hotspots and publish your visitor experience.</p>
        <label htmlFor="editor-password">Editor password</label>
        <input id="editor-password" type="password" autoFocus required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
        {error && <div className="error-text" role="alert">{error}</div>}
        <div className="button-row"><button className="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Open editor'}</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </div>
  )
}
