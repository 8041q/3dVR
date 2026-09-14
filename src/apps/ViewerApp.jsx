import React, { useEffect, useState } from 'react'
import Viewer from '../components/Viewer'
import ProjectOfflineControl from '../components/ProjectOfflineControl'
import { useProject } from '../hooks/useProject'

export default function ViewerApp({ projectId='default' }) { const {project,loading,error,source,reload}=useProject(projectId); const [sceneId,setSceneId]=useState(null); const scenes=project?.scenes||[]; useEffect(()=>{if(project&&scenes.length&&(!sceneId||!scenes.some((x)=>x.id===sceneId)))setSceneId(project.startSceneId||scenes[0].id)},[project,scenes,sceneId]); if(loading)return <div className="app-loading">Loading project…</div>; if(error)return <div className="app-loading"><div className="error-text">{error}</div><button onClick={reload}>Retry</button></div>; if(!sceneId)return null; return <div className="app"><Viewer sceneId={sceneId} onNavigate={setSceneId} scenes={scenes}/><ProjectOfflineControl project={project} source={source}/><div className="project-badge">{project.title||project.id}{source==='offline'?' · offline copy':''}</div></div> }
