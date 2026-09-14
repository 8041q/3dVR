import React from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { getAppRoute } from './routing'
import EditorApp from './apps/EditorApp'
import ViewerApp from './apps/ViewerApp'

export default function App() {
  const route = getAppRoute()
  return route.kind === 'editor'
    ? <AuthProvider><EditorApp projectId={route.projectId} /></AuthProvider>
    : <ViewerApp projectId={route.projectId} />
}
