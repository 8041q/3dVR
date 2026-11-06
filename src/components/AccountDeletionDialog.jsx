import React, { useEffect, useId, useRef, useState } from 'react'
import { accountRequest } from '../contexts/AuthContext'
import { Notice } from './accountUi'
import BackLink from './ui/BackLink'

export default function AccountDeletionDialog({ user, self, onClose, onDeleted }) {
  const dialog=useRef(null),heading=useRef(null),emailInput=useRef(null),title=useId(),controller=useRef(null)
  const [step,setStep]=useState(1),[email,setEmail]=useState(''),[summary,setSummary]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[exported,setExported]=useState(false)
  const endpoint='/api/accounts/users/'+encodeURIComponent(user.id)
  useEffect(()=> {
    const opener=document.activeElement, abort=new AbortController()
    dialog.current.showModal()
    accountRequest(endpoint+'/deletion-summary',null,null,{signal:abort.signal}).then(setSummary).catch(failure=>{if(!abort.signal.aborted)setError(failure.message)})
    return ()=>{abort.abort();controller.current?.abort();if(opener?.isConnected)opener.focus()}
  },[endpoint])
  useEffect(()=>{if(step===2)emailInput.current?.focus();else heading.current?.focus()},[step])
  function showStep(next){setError('');setStep(next)}
  async function exportAll() {
    setBusy('export');setError('')
    const abort=new AbortController();controller.current=abort
    try {
      const result=await accountRequest(endpoint+'/export',{email,confirmation:'DELETE'},'POST',{signal:abort.signal})
      if(!/^\/api\/accounts\/exports\/[a-f0-9]{64}$/.test(result.downloadUrl || '')) throw new Error('The server returned an invalid download link.')
      const link=document.createElement('a');link.href=result.downloadUrl;link.download=result.filename;document.body.append(link);link.click();link.remove();setExported(true)
    } catch(failure){if(!abort.signal.aborted)setError(failure.message)}finally{if(!abort.signal.aborted)setBusy('')}
  }
  async function remove() {
    setBusy('delete');setError('')
    try {const result=await accountRequest(endpoint+'/deletion',{email,confirmation:'DELETE'});await onDeleted(result)}catch(failure){setError(failure.message);setBusy('')}
  }
  return <dialog ref={dialog} className="account-ui account-dialog account-confirm-dialog account-deletion-dialog" aria-labelledby={title} onCancel={event=>{event.preventDefault();if(busy!=='delete')onClose()}}>
    <header className={`account-deletion-heading${step===1?' account-deletion-heading--initial':''}`}>
      {step>1 && <BackLink disabled={Boolean(busy)} onClick={()=>showStep(step-1)}>Back</BackLink>}<span className="account-eyebrow">STEP {step} OF 3</span>
      <h2 ref={heading} tabIndex={-1} id={title}>{step===1?'Delete account?':step===2?'Confirm deletion':'Save a backup'}</h2>
    </header>
    <div className="account-confirm-body"><Notice error>{error}</Notice>
      {step===1 && <>
        <p className="account-deletion-person"><strong>{user.name || user.email}</strong>{user.name && user.name!==user.email && <span>{user.email}</span>}</p>
        <p>{self?'You’ll':'They’ll'} be signed out immediately. The account is deleted after <strong>30 days</strong>; signing in before then cancels deletion.</p>
        <div className="account-deletion-impact"><p>Projects and assets stay available to their other owners. Projects with no remaining owner are deleted.</p>{summary && <p className="account-help">{summary.deletedProjects} {summary.deletedProjects===1?'project':'projects'} deleted · {summary.retainedProjects} kept for other owners</p>}</div>
      </>}
      {step===2 && <label className="account-field account-deletion-confirmation"><span>Type <strong>{user.email}</strong> to continue.</span><input ref={emailInput} autoComplete="off" spellCheck={false} value={email} onChange={event=>setEmail(event.target.value)} aria-label="Account email confirmation" /></label>}
      {step===3 && <>
        <p>Download your projects, assets and other uploaded media before scheduling deletion.</p>
        {summary && <p className="account-help">{summary.projects} {summary.projects===1?'project':'projects'} · {summary.assets} media items</p>}
        <button className="account-primary" disabled={Boolean(busy) || !summary} onClick={exportAll}>{busy==='export'?'Preparing backup…':exported?'Download another backup':'Download all projects and assets'}</button>
        {exported && <Notice>The download has started. Keep your backup somewhere safe.</Notice>}
        <p className="account-help">Nothing is deleted yet. Download a backup or finish without one.</p>
      </>}
    </div>
    <div className="account-actions account-confirm-actions"><button type="button" disabled={busy==='delete'} onClick={onClose}>Cancel</button>{step<3
      ? <button type="button" className={step===2?'account-danger':'account-primary'} disabled={!summary || (step===2 && email.trim().toLowerCase()!==user.email.toLowerCase())} onClick={()=>showStep(step+1)}>{step===1?'Continue':'Confirm and continue'}</button>
      : <button className="account-danger" disabled={Boolean(busy) || !summary} onClick={remove}>{busy==='delete'?'Scheduling…':'Schedule deletion'}</button>}
    </div>
  </dialog>
}
