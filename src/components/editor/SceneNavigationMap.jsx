import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { arrangeSceneGraph, MAP_CARD, sceneGraph, sceneMapPositions } from '../../editor/sceneGraph'
import HomeIcon from '../ui/HomeIcon'
import './sceneMapDialog.css'

export default function SceneNavigationMap({ scenes, currentSceneId, startSceneId, onStartSceneChange, onNavigate, onScenesChange, onClose }) {
  const dialog = useRef(null), viewport = useRef(null), drag = useRef(null), pan = useRef(null)
  const [selectedId, setSelectedId] = useState(currentSceneId || startSceneId)
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [zoom, setZoom] = useState(1), [moving, setMoving] = useState(null)
  const markerId = useId().replace(/:/g, '')
  const layoutRoot = useRef(startSceneId)
  const graph = useMemo(() => sceneGraph(scenes, startSceneId), [scenes, startSceneId])
  const basePositions = useMemo(() => sceneMapPositions(scenes, layoutRoot.current), [scenes])
  const positions = useMemo(() => { const next = new Map(basePositions); if (moving) next.set(moving.id,moving); return next }, [basePositions,moving])
  const selected = scenes.find(scene => scene.id === selectedId) || scenes[0]
  const unreachable = scenes.filter(scene => !graph.reachable.has(scene.id)), deadEnds = scenes.filter(scene => !(graph.outgoing.get(scene.id)?.length))
  const matches = scene => `${scene.title || ''} ${scene.group || ''}`.toLowerCase().includes(query.trim().toLowerCase()) && (filter === 'all' || (filter === 'unreachable' ? !graph.reachable.has(scene.id) : !graph.outgoing.get(scene.id)?.length))
  const bounds = { width: Math.max(420, ...[...positions.values()].map(pos => pos.x + MAP_CARD.width + 48)), height: Math.max(280, ...[...positions.values()].map(pos => pos.y + MAP_CARD.height + 48)) }
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => {
    const view = viewport.current
    const wheel = event => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      changeZoom(zoom + (event.deltaY > 0 ? -0.1 : 0.1))
    }
    view.addEventListener('wheel', wheel, { passive: false })
    return () => view.removeEventListener('wheel', wheel)
  }, [zoom])
  function patch(id, pos) { onScenesChange(current => current.map(scene => ({ ...scene, editorMapPosition: scene.id === id ? pos : positions.get(scene.id) }))) }
  function changeZoom(value) {
    const next = Math.min(1.75, Math.max(0.35, value)), view = viewport.current, ratio = next / zoom
    const center = { x: (view.scrollLeft + view.clientWidth / 2) * ratio - view.clientWidth / 2, y: (view.scrollTop + view.clientHeight / 2) * ratio - view.clientHeight / 2 }
    setZoom(next)
    requestAnimationFrame(() => { view.scrollLeft = center.x; view.scrollTop = center.y })
  }
  function fit() {
    const view = viewport.current
    setZoom(Math.min(1, Math.max(0.35, Math.min((view.clientWidth - 32) / bounds.width, (view.clientHeight - 32) / bounds.height))))
    view.scrollTo({ left: 0, top: 0 })
  }
  function focusScene(id) {
    setSelectedId(id)
    const pos = positions.get(id), view = viewport.current
    if (pos) view.scrollTo({ left: (pos.x + MAP_CARD.width / 2) * zoom - view.clientWidth / 2, top: (pos.y + MAP_CARD.height / 2) * zoom - view.clientHeight / 2, behavior: 'smooth' })
  }
  function finishDrag(event, commit) {
    const current = drag.current
    if (current?.pointerId !== event.pointerId) return
    drag.current = null; setMoving(null)
    if (commit && current.position) patch(current.id, current.position)
  }
  return createPortal(<dialog ref={dialog} className="scene-map-dialog studio-scene-map map-v2" aria-labelledby="scene-map-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="scene-map-dialog__header"><div><div className="editor-eyebrow">Navigation map</div><h2 id="scene-map-title">Explore your tour’s connections</h2><p>Follow routes, find disconnected scenes and organise your project.</p></div><div className="scene-map-dialog__actions"><button type="button" className="scene-map-dialog__back" onClick={onClose}>← Back to scenes</button><button type="button" className="primary" onClick={onClose}>Done</button></div></header>
    <div className="scene-map-toolbar">
      <input type="search" aria-label="Find a scene on the map" placeholder="Find a scene…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { const scene = scenes.find(matches); if (scene) focusScene(scene.id) } }} />
      <select aria-label="Filter map scenes" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All scenes ({scenes.length})</option><option value="unreachable">Unreachable ({unreachable.length})</option><option value="dead-end">End points ({deadEnds.length})</option></select>
      <div role="group" aria-label="Map zoom"><button aria-label="Zoom out" onClick={() => changeZoom(zoom - 0.15)} disabled={zoom <= 0.35}>−</button><output>{Math.round(zoom * 100)}%</output><button aria-label="Zoom in" onClick={() => changeZoom(zoom + 0.15)} disabled={zoom >= 1.75}>+</button><button onClick={fit}>Fit map</button></div>
      <button onClick={() => { onScenesChange(current => arrangeSceneGraph(current, startSceneId)); setZoom(1); viewport.current.scrollTo({ left: 0, top: 0 }) }}>Auto arrange</button>
    </div>
    <div className="scene-map-layout">
      <div ref={viewport} className="scene-map-dialog__viewport" tabIndex={0} aria-label="Scene map canvas. Scroll to pan. Control and wheel to zoom."
        onPointerDown={event => { if (event.button !== 0 || event.target.closest('button,.scene-map-node')) return; pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={event => { const p = pan.current; if (p?.id === event.pointerId) { event.currentTarget.scrollLeft = p.left - (event.clientX - p.x); event.currentTarget.scrollTop = p.top - (event.clientY - p.y) } }} onPointerUp={() => { pan.current = null }} onPointerCancel={() => { pan.current = null }}>
        <div className="scene-map-extent" style={{ width: bounds.width * zoom, height: bounds.height * zoom }}><div className="scene-map-canvas" style={{ width: bounds.width, height: bounds.height, transform: `scale(${zoom})` }}>
          <svg className="scene-map-links" width={bounds.width} height={bounds.height} aria-hidden="true"><defs><marker id={markerId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker></defs>
            {graph.edges.map(edge => {
              const from = positions.get(edge.from), to = positions.get(edge.to), forward = to.x > from.x, direction = forward ? 1 : -1
              const x1 = from.x + (forward ? MAP_CARD.width : 0), y1 = from.y + MAP_CARD.height / 2, x2 = to.x + (forward ? 0 : MAP_CARD.width), y2 = to.y + MAP_CARD.height / 2, bend = Math.max(70, Math.abs(x2 - x1) / 2)
              const back = to.x < from.x
              const route = back ? `M${from.x + MAP_CARD.width / 2},${from.y} C${from.x + MAP_CARD.width / 2},${Math.max(8,Math.min(from.y,to.y)-44)} ${to.x + MAP_CARD.width / 2},${Math.max(8,Math.min(from.y,to.y)-44)} ${to.x + MAP_CARD.width / 2},${to.y}` : `M${x1},${y1} C${x1 + direction * bend},${y1} ${x2 - direction * bend},${y2} ${x2},${y2}`
              return <path key={edge.id} className={edge.from === selected?.id || edge.to === selected?.id ? 'is-connected' : ''} d={route} markerEnd={`url(#${markerId})`} />
            })}
          </svg>
          {scenes.map(scene => {
            const pos = positions.get(scene.id)
            return <article key={scene.id} className={`scene-map-node${scene.id === selected?.id ? ' active' : ''}${!matches(scene) ? ' is-dimmed' : ''}${!graph.reachable.has(scene.id) ? ' is-unreachable' : ''}`} style={{ left: pos.x, top: pos.y, width: MAP_CARD.width, height: MAP_CARD.height }}>
              <button className="scene-map-node__select" aria-label={`Select ${scene.title || scene.id}`} aria-pressed={scene.id === selected?.id} onClick={() => setSelectedId(scene.id)} onDoubleClick={() => { onNavigate(scene.id); onClose() }}>
                <span className="scene-map-node__image">{scene.image?.startsWith('/') ? <img src={`/api/assets/thumbnail?url=${encodeURIComponent(scene.image)}`} alt="" loading="lazy" /> : <span aria-hidden="true">360°</span>}</span><strong>{scene.title || scene.id}</strong><span>{scene.group || 'No group'}</span><small>{graph.incoming.get(scene.id).length} in · {graph.outgoing.get(scene.id).length} out</small>
              </button>
              {scene.id === startSceneId && <span className="scene-map-home" title="Starting scene" aria-label="Starting scene"><HomeIcon size={14} /></span>}
              <button className="scene-map-node__drag" aria-label={`Move ${scene.title || scene.id} on map`} title="Drag to move. Arrow keys move; Shift moves faster."
                onPointerDown={event => { if (event.button !== 0) return; event.stopPropagation(); drag.current = { id: scene.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, original: pos }; event.currentTarget.setPointerCapture(event.pointerId) }}
                onPointerMove={event => { const d = drag.current; if (d?.pointerId !== event.pointerId) return; d.position = { x: Math.max(16, d.original.x + (event.clientX - d.x) / zoom), y: Math.max(16, d.original.y + (event.clientY - d.y) / zoom) }; setMoving({ id: d.id, ...d.position }) }}
                onPointerUp={event => finishDrag(event, true)} onPointerCancel={event => finishDrag(event, false)} onLostPointerCapture={event => finishDrag(event, false)}
                onKeyDown={event => { const dirs = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] }, dir = dirs[event.key]; if (!dir) return; event.preventDefault(); const step = event.shiftKey ? 64 : 16; patch(scene.id, { x: Math.max(16, pos.x + dir[0] * step), y: Math.max(16, pos.y + dir[1] * step) }) }}><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{[6,12,18].flatMap(y=>[8,16].map(x=><circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" />))}</svg></button>
            </article>
          })}
        </div></div>
      </div>
      <aside className="scene-map-inspector" aria-label="Selected scene connections">{selected && <>
        <div className="editor-eyebrow">Selected scene</div><h3>{selected.title || selected.id}</h3><p>{graph.reachable.has(selected.id) ? 'Reachable from the starting scene.' : 'No navigation route from the starting scene.'}</p><div className="scene-map-inspector-actions"><button className="primary" onClick={() => { onNavigate(selected.id); onClose() }}>Edit scene</button><button disabled={selected.id === startSceneId} onClick={() => onStartSceneChange(selected.id)}><HomeIcon /> Make starting scene</button></div>
        <h4>Leads to · {graph.outgoing.get(selected.id).length}</h4>{graph.outgoing.get(selected.id).map(edge => <button className="scene-map-route" key={edge.id} onClick={() => focusScene(edge.to)}><strong>{scenes.find(scene => scene.id === edge.to)?.title || edge.to} →</strong><small>{edge.labels.join(' · ')}</small></button>)}{!graph.outgoing.get(selected.id).length && <p>This scene is an end point. Add a navigation hotspot in the editor to connect it to another scene.</p>}
        <h4>Reached from · {graph.incoming.get(selected.id).length}</h4>{graph.incoming.get(selected.id).map(edge => <button className="scene-map-route" key={edge.id} onClick={() => focusScene(edge.from)}>← {scenes.find(scene => scene.id === edge.from)?.title || edge.from}</button>)}
      </>}</aside>
    </div>
    <footer className="scene-map-dialog__footer"><span>{scenes.length} scenes · {graph.edges.length} connections</span><button onClick={() => setFilter(filter === 'unreachable' ? 'all' : 'unreachable')}>{unreachable.length} unreachable</button>{graph.broken.length > 0 && <span className="studio-warning">{graph.broken.length} broken navigation targets</span>}<span>Drag the background to pan · Double-click a scene to edit · Layout changes can be undone</span></footer>
  </dialog>, document.body)
}
