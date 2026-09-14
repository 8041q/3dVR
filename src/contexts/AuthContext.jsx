import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const AuthContext = createContext(null)
const KEY = '3dvr-editor-token'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(KEY) || '')
  const [checking, setChecking] = useState(Boolean(token))

  useEffect(() => {
    if (!token) { setChecking(false); return }
    fetch('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((body) => { if (!body.authenticated) { localStorage.removeItem(KEY); setToken('') } })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [token])

  async function login(password) {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(body.error || 'Login failed')
    localStorage.setItem(KEY, body.token); setToken(body.token); return true
  }
  function logout() { localStorage.removeItem(KEY); setToken('') }
  const value = useMemo(() => ({ token, isEditor: Boolean(token), checking, login, logout }), [token, checking])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }
