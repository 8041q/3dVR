import React, { useState } from 'react'
import { accountRequest, useAuth } from '../contexts/AuthContext'
import { Notice, PasswordField } from './accountUi'
import { createQrSvg } from '../share/qrCode'

export default function AuthenticatorSetup({ onComplete, initialSetup }) {
  const auth = useAuth()
  const [password, setPassword] = useState('')
  const [setup, setSetup] = useState(initialSetup || null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  let qr = null
  if (setup) {
    // Long account identifiers can exceed the tour sharing QR capacity.
    // Manual setup must remain available instead of crashing this screen.
    try { qr = createQrSvg(setup.totpURI) } catch { /* Show manual setup below. */ }
  }
  const secret = setup ? new URL(setup.totpURI).searchParams.get('secret') : ''

  async function start(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      setSetup(await accountRequest('/api/auth/two-factor/enable', { password }))
      setPassword('')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  async function verify(event) {
    event.preventDefault()
    const digits = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(digits)) { setError('Enter the six-digit code shown in your authenticator app.'); return }
    setBusy(true); setError('')
    try {
      await accountRequest('/api/auth/two-factor/verify-totp', { code: digits })
      await auth.refresh()
      onComplete('Setup complete. Your authenticator is connected and your account is ready.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  return <section className="account-panel account-authenticator" aria-labelledby="authenticator-title">
    <h2 id="authenticator-title">Connect an authenticator</h2>
    <p>The six-digit code comes from an authenticator app on your phone. No email is sent, and no email server is needed.</p>
    {auth.user.role === 'owner' && <p>This protects your owner account. You only need to connect the app once.</p>}
    {!setup && <Notice error>{error}</Notice>}
    {!setup ? <form onSubmit={start}>
      <PasswordField id="authenticator-password" label="Confirm your account password" value={password} onChange={event => setPassword(event.target.value)} />
      <button className="account-primary" disabled={busy}>{busy ? 'Preparing…' : 'Show setup QR code'}</button>
    </form> : <>
      <ol>
        <li>Open your authenticator app and choose to add an account.</li>
        <li>Scan this QR code. The app will start displaying a six-digit code.</li>
        <li>Enter that code below to finish setup.</li>
      </ol>
      {qr && <img alt="Scan this QR code with your authenticator app" src={'data:image/svg+xml,' + encodeURIComponent(qr)} />}
      <details open={!qr}><summary>Can't scan? Enter a setup key instead</summary>
        <p>Choose a time-based account in your authenticator and enter this key:</p>
        <code className="authenticator-secret">{secret}</code>
      </details>
      <details><summary>Save recovery codes</summary><p>Keep these somewhere private. Use one if you lose your authenticator.</p><pre>{setup.backupCodes?.join('\n')}</pre></details>
      <form onSubmit={verify}>
        <Notice error>{error}</Notice>
        <label className="account-field">Code from your authenticator<input className="account-code" required inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={event => setCode(event.target.value)} aria-describedby="authenticator-help" /></label>
        <p className="account-help" id="authenticator-help">Codes change regularly. If a code expires, enter the next one shown in the app.</p>
        <button className="account-primary" disabled={busy}>{busy ? 'Verifying…' : 'Verify and finish setup'}</button>
      </form>
    </>}
  </section>
}
