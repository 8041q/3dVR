import React, { useEffect, useState } from 'react'
import { accountRequest, useAuth } from '../contexts/AuthContext'
import { Notice, PanelHeading } from './accountUi'

export default function DeviceSessions() {
  const auth=useAuth(),[devices,setDevices]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  async function load(){setDevices(await accountRequest('/api/accounts/sessions'))}
  useEffect(()=>{let alive=true;accountRequest('/api/accounts/sessions').then(data=>{if(alive)setDevices(data)}).catch(failure=>{if(alive)setError(failure.message)});return()=>{alive=false}},[])
  async function revoke(scope,id) {
    setBusy(true);setError('');setMessage('')
    try {
      const result=id ? await accountRequest('/api/accounts/sessions/'+encodeURIComponent(id),null,'DELETE') : await accountRequest('/api/accounts/sessions/revoke',{scope})
      if(result.currentSignedOut) return await auth.logout()
      await load();setMessage(`${result.count} device ${result.count===1?'session was':'sessions were'} signed out.`)
    } catch(failure){setError(failure.message)}finally{setBusy(false)}
  }
  return <section className="account-panel"><PanelHeading title="Your devices" description="Only you can view these sessions and their network details."><div className="account-actions"><button disabled={busy} onClick={async()=>{setError('');try{await load()}catch(failure){setError(failure.message)}}}>Refresh</button>{devices && <button disabled={busy || !devices.length} onClick={()=>revoke('all')}>Sign out all devices</button>}</div></PanelHeading><Notice error>{error}</Notice><Notice>{message}</Notice>
    {!devices && !error && <p role="status">Loading your devices…</p>}
    <div className="account-device-list">{devices?.slice().sort((a,b)=>Number(b.current)-Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt)).map(device=><article className="account-device" key={device.id}><div><strong>{device.device}</strong>{device.current && <span className="account-badge">This device</span>}<p className="account-help">IP: {device.ip} · Approximate location: {device.location}</p><p className="account-help">Signed in {new Date(device.createdAt).toLocaleString()} · Last active {new Date(device.lastSeenAt).toLocaleString()}</p></div><button disabled={busy} onClick={()=>revoke('single',device.id)}>{device.current?'Sign out this device':'Sign out'}</button></article>)}</div>
    <p className="account-help account-device-note">Locations are estimates and may show a VPN’s country. Local addresses show “Local network”. Lookup runs on this server using <a href="https://db-ip.com/" target="_blank" rel="noopener noreferrer">DB-IP data</a>.</p>
  </section>
}
