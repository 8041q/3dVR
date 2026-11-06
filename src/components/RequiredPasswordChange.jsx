import React, { useState } from 'react'
import { accountRequest } from '../contexts/AuthContext'
import { Notice, PasswordField } from './accountUi'
import '../apps/account.css'

export default function RequiredPasswordChange({ onSaved, onSignOut }) {
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  async function submit(event) {
    event.preventDefault();setError('')
    if(password!==confirmation) return setError('The passwords do not match.')
    setBusy(true)
    try{await accountRequest('/api/accounts/password-required',{newPassword:password});setPassword('');setConfirmation('');await onSaved()}
    catch(failure){setError(failure.message)}finally{setBusy(false)}
  }
  return <div className="account-ui account-shell"><header className="account-header"><span className="account-brand">Atria Studio</span></header><main className="account-state"><section className="account-panel"><div className="account-eyebrow">CHOOSE YOUR OWN PASSWORD</div><h1>Replace your temporary password.</h1><p>Your administrator reset your password. Choose a new one to continue. This step stays required until you finish it.</p><form className="account-form" onSubmit={submit} aria-busy={busy}><Notice error>{error}</Notice><PasswordField id="required-password" label="New password" autoComplete="new-password" minLength={15} value={password} onChange={event=>setPassword(event.target.value)} /><PasswordField id="required-password-confirmation" label="Confirm new password" autoComplete="new-password" minLength={15} value={confirmation} onChange={event=>setConfirmation(event.target.value)} /><p className="account-help">Use at least 15 characters.</p><button className="account-primary" disabled={busy}>{busy?'Saving…':'Save password and continue'}</button><button type="button" disabled={busy} onClick={onSignOut}>Sign out</button></form></section></main></div>
}
