import React, { useState } from 'react'
import Viewer from './components/Viewer'
import scenes from './data/scenes.json'

export default function App() {
  const [sceneId, setSceneId] = useState(scenes[0].id)
  const handleNavigate = (id) => setSceneId(id)

  return (
    <div className="app">
      <Viewer sceneId={sceneId} onNavigate={handleNavigate} scenes={scenes} />
    </div>
  )
}
