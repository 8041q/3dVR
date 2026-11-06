import React, { useEffect, useId, useRef } from 'react'
import '../apps/account.css'

export default function ConfirmDialog({ title, children, confirmLabel='Confirm', onConfirm, onClose, busy=false, danger=false }) {
  const dialog=useRef(null), titleId=useId()
  useEffect(()=> {
    const opener=document.activeElement
    dialog.current.showModal()
    return ()=>{if(opener?.isConnected) opener.focus()}
  },[])
  return <dialog ref={dialog} className="account-ui account-dialog account-confirm-dialog" role="alertdialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
    <h2 id={titleId}>{title}</h2><div className="account-confirm-body">{children}</div><div className="account-actions account-confirm-actions"><button type="button" autoFocus disabled={busy} onClick={onClose}>Cancel</button><button type="button" className={danger?'account-danger':'account-primary'} disabled={busy} onClick={onConfirm}>{busy?'Working…':confirmLabel}</button></div>
  </dialog>
}
