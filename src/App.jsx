import React, { useEffect } from 'react'
import { AuthProvider, accountRequest } from './contexts/AuthContext'
import { getAppRoute } from './routing'
import { applyAccentColor, applyStoredAccent } from './utils/accent'
import EditorApp from './apps/EditorApp'
import PreviewApp from './apps/PreviewApp'
import AccountApp from './apps/AccountApp'
import ViewerApp from './apps/ViewerApp'

// First paint uses the last known accent instead of the default blue.
applyStoredAccent()

export default function App() {
  const route = getAppRoute()

  useEffect(() => {
    // Public on purpose: visitors of a shared tour and non-owner members can't
    // read /owner/settings, but they all need the host's accent.
    accountRequest('/api/accounts/appearance').then(appearance => {
      if (appearance && appearance.accentColor) applyAccentColor(appearance.accentColor, { remember: true })
    }).catch(() => { /* offline or unreachable: keep the last remembered accent */ })
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