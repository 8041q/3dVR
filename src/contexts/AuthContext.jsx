import React, { createContext, useContext, useEffect, useState } from 'react'
import { canAuthorProjects } from '../accountCapabilities'
import { clearPrivateDownloads, setOfflineAccount } from '../offline/projectStore'
import RequiredPasswordChange from '../components/RequiredPasswordChange'
const Context = createContext(null)
export async function accountRequest(path, body, method, options={}) {
  const response = await fetch(path,{ method:method || (body ? 'POST' : 'GET'), credentials:'same-origin', headers:body ? {'Content-Type':'application/json'} : {}, signal:options.signal, ...(body ? {body:JSON.stringify(body)} : {}) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(data.error?.message || data.error || data.message || 'Account operation failed.'), { status: response.status, code:data.code, signInUrl:data.signInUrl })
  return data
}
export function AuthProvider({ children }) {
  const [user,setUser] = useState(null), [checking,setChecking] = useState(true)
  const [installation,setInstallation]=useState(null), [sessionError,setSessionError]=useState('')
  const [accountNotice,setAccountNotice]=useState('')
  async function refresh() {
    if(localStorage.getItem('3dvr-logout-pending')) {await accountRequest('/api/auth/sign-out',{});localStorage.removeItem('3dvr-logout-pending')}
    const data = await accountRequest('/api/accounts/me')
    setInstallation(data.installation || null);setSessionError('')
    setAccountNotice(data.notice || '')
    const previous = localStorage.getItem('3dvr-offline-account')
    if (previous && (previous !== data.user?.id || data.user?.mustChangePassword)) await clearPrivateDownloads()
    if (data.user && !data.user.mustChangePassword) localStorage.setItem('3dvr-offline-account',data.user.id)
    else localStorage.removeItem('3dvr-offline-account')
    await setOfflineAccount(data.user?.mustChangePassword ? null : data.user?.id || null)
    setUser(data.user)
    return data.user
  }
  useEffect(() => { localStorage.removeItem('3dvr-editor-token'); refresh().catch(error => setSessionError(error.message)).finally(() => setChecking(false)) },[])
  useEffect(() => { const changed=e=>{if(e.key==='3dvr-offline-account') location.reload()}; window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed) },[])
  async function login(email,password) {
    const data = await accountRequest('/api/auth/sign-in/email',{email,password})
    if (data.twoFactorRedirect) return false
    await refresh(); return true
  }
  async function verify(code, backup = false) {
    await accountRequest('/api/auth/two-factor/' + (backup ? 'verify-backup-code' : 'verify-totp'),{code,trustDevice:true})
    await refresh()
  }
  async function logout() {
    localStorage.setItem('3dvr-logout-pending','1')
    try {await accountRequest('/api/auth/sign-out',{});localStorage.removeItem('3dvr-logout-pending')} catch { /* Retry revocation before reading identity on the next connection. */ }
    localStorage.removeItem('3dvr-offline-account'); setUser(null)
    try {await setOfflineAccount(null)} finally {await clearPrivateDownloads()}
  }
  return <Context.Provider value={{ user, installation, accountNotice, sessionError, checking, isEditor:canAuthorProjects(user), token:'', refresh, login, verify, logout }}>{user?.mustChangePassword ? <RequiredPasswordChange onSaved={refresh} onSignOut={logout} /> : children}</Context.Provider>
}
export function useAuth() { return useContext(Context) }
