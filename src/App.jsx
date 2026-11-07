import React, { useEffect } from 'react'
import { AuthProvider, accountRequest } from './contexts/AuthContext'
import { getAppRoute } from './routing'
import { applyAccentColor } from './utils/accent'
import EditorApp from './apps/EditorApp'
import PreviewApp from './apps/PreviewApp'
import AccountApp from './apps/AccountApp'
import ViewerApp from './apps/ViewerApp'

export default function App() {
  const route = getAppRoute()

  useEffect(() => {
    accountRequest('/api/accounts/owner/settings').then(settings => {
      if (settings && settings.accentColor) applyAccentColor(settings.accentColor)
    }).catch(() => { /* non-owner or no settings yet; keep default */ })
  }, [])

  if (route.kind === 'account') return <AuthProvider><AccountApp /></AuthProvider>

  if (route.kind === 'editor') {
    return <AuthProvider><EditorApp projectId={route.projectId} /></AuthProvider>
  }

  if (route.kind === 'preview') {
    return <PreviewApp projectId={route.projectId} />
  }

  return <AuthProvider><ViewerApp projectId={route.projectId} /></AuthProvider>
}
