import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Notice, PasswordField } from './accountUi'
import '../apps/account.css'

export default function LoginModal({ onClose, notice, embedded = false }) {
  const { login, verify } = useAuth()
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState(false), [code, setCode] = useState(''), [backup, setBackup] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [resetHelp, setResetHelp] = useState(false), [signInUrl,setSignInUrl]=useState('')
  const form = useRef(null)
  useEffect(() => {
    if (embedded) return
    const previous = document.activeElement
    form.current?.querySelector('input')?.focus()
    return () => previous?.focus?.()
  }, [embedded])
  function keydown(event) {
    if (event.key === 'Escape' && onClose && !busy) onClose()
    if (embedded || event.key !== 'Tab') return
    const nodes = [...form.current.querySelectorAll('input,button,a[href]')].filter(node => !node.disabled)
    const first = nodes[0], last = nodes.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  async function submit(event) {
    event.preventDefault(); setError('');setSignInUrl('')
    const normalized = code.replace(/\s/g, '')
    if (challenge && !backup && !/^\d{6}$/.test(normalized)) { setError('Enter the six-digit code from your authenticator app.'); return }
    setBusy(true)
    try {
      if (challenge) { await verify(backup ? code.trim() : normalized, backup); onClose?.() }
      else if (await login(email.trim(), password)) onClose?.()
      else { setChallenge(true); setCode('') }
    } catch (failure) { setError(failure.message);setSignInUrl(failure.code==='ORIGIN_MISMATCH' ? failure.signInUrl : '') }
    finally { setBusy(false) }
  }
  const content = <form ref={form} className="account-form account-login" onSubmit={submit} onKeyDown={keydown} aria-labelledby="account-login-title" aria-busy={busy}>
    <div className="account-eyebrow">ATRIA STUDIO</div>
    <h1 id="account-login-title">{challenge ? 'One more step.' : 'Welcome back.'}</h1>
    <p className="account-intro">{challenge ? `Confirm it’s you to sign in as ${email}.` : 'Sign in to your workspace to create and share your tours.'}</p>
    <Notice>{notice}</Notice>{(error || signInUrl) && <Notice error>{error}{signInUrl && <p><a href={signInUrl}>Open server sign-in</a></p>}</Notice>}
    {!challenge ? <>
      <label className="account-field">Account email<input type="email" autoComplete="username" autoFocus={embedded} required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <PasswordField label="Password" id="account-login-password" value={password} onChange={event => setPassword(event.target.value)} />
      <button className="account-link-button" type="button" onClick={() => setResetHelp(!resetHelp)} aria-expanded={resetHelp}>Forgot your password?</button>
      {resetHelp && <p className="account-help">Ask your server owner for a temporary password. Owner accounts can use the local recovery command on their server.</p>}
    </> : <>
      <div className="account-instruction">{backup ? 'Enter one of the recovery codes you saved when connecting your authenticator.' : 'Open your authenticator app and enter the six-digit code for Atria. No email is sent.'}</div>
      <label className="account-field">{backup ? 'Recovery code' : 'Authenticator code'}<input key={backup ? 'backup' : 'totp'} className={backup ? '' : 'account-code'} autoFocus required inputMode={backup ? 'text' : 'numeric'} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} placeholder={backup ? 'Recovery code' : '123456'} /></label>
      <p className="account-help">After verification, this browser won’t need another code for two hours.</p>
      <button className="account-link-button" type="button" onClick={() => {setBackup(!backup);setCode('');setError('')}}>{backup ? 'Use authenticator instead' : 'Use a recovery code instead'}</button>
    </>}
    <button className="account-primary account-submit" disabled={busy}>{busy ? 'Signing in…' : challenge ? 'Verify and sign in' : 'Sign in'}</button>
    <div className="account-login-footer">{challenge ? <button type="button" className="account-link-button" disabled={busy} onClick={() => {setChallenge(false);setCode('');setError('')}}>Use another account</button> : <span>Accounts are created by your server owner.</span>}{onClose && <button type="button" disabled={busy} onClick={onClose}>Cancel</button>}</div>
  </form>
  return embedded ? content : <div className="account-dialog-backdrop"><div className="account-ui account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-login-title">{content}</div></div>
}
