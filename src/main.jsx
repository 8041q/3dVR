import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './uiTheme.css'
import './styles.css'
import './components/editor/editorWorkspace.css'
import './components/viewerSurfaces.css'
import './components/ui/select.css'
import './components/product/productInspection.css'
import './components/editor/modelAuthoring.css'
import { registerOfflineServiceWorker } from './offline/serviceWorker'

registerOfflineServiceWorker()
createRoot(document.getElementById('root')).render(<App />)
