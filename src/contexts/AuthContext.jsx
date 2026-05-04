import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [isEditor, setIsEditor] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('vr_editor_token')
    if (!token) { setChecking(false); return }

    fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (r.ok) setIsEditor(true) })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  const login = useCallback(async (password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Login failed')
    }
    const { token } = await res.json()
    localStorage.setItem('vr_editor_token', token)
    setIsEditor(true)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('vr_editor_token')
    setIsEditor(false)
  }, [])

  return (
    <AuthContext.Provider value={{ isEditor, checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

export function getAuthHeaders() {
  const token = localStorage.getItem('vr_editor_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}
