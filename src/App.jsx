import React from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { getAppRoute } from './routing'
import EditorApp from './apps/EditorApp'
import PreviewApp from './apps/PreviewApp'
import ViewerApp from './apps/ViewerApp'

export default function App() {
  const route = getAppRoute()

  if (route.kind === 'editor') {
    return <AuthProvider><EditorApp projectId={route.projectId} /></AuthProvider>
  }

  if (route.kind === 'preview') {
    return <PreviewApp projectId={route.projectId} />
  }

  return <ViewerApp projectId={route.projectId} />
}
