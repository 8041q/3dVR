import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { hotspotDestination } from '../../actions/actionTypes'

const CARD_WIDTH = 174
const CARD_HEIGHT = 72
const GRID_X = 212
const GRID_Y = 112
const START_X = 46
const START_Y = 54

function fallbackPosition(index, columns = 4) {
  return {
    x: START_X + (index % columns) * GRID_X,
    y: START_Y + Math.floor(index / columns) * GRID_Y,
  }
}

function positionFor(scene, index) {
  const stored = scene?.editorMapPosition
  if (Number.isFinite(stored?.x) && Number.isFinite(stored?.y)) return stored
  return fallbackPosition(index)
}

function sceneConnections(scenes) {
  const validIds = new Set(scenes.map((scene) => scene.id))
  const connections = []
  const seen = new Set()

  for (const scene of scenes) {
    for (const hotspot of scene.hotspots || []) {
      const to = hotspotDestination(hotspot, scene.id, validIds)
      if (!to) continue
      const key = `${scene.id}->${to}`
      if (seen.has(key)) continue
      seen.add(key)
      connections.push({ from: scene.id, to })
    }
  }

  return connections
}

export default function SceneMapDialog({
  scenes,
  currentSceneId,
  startSceneId,
  onNavigate,
  onScenesChange,
  onClose,
}) {
  const dragRef = useRef(null)
  const [dragPosition, setDragPosition] = useState(null)
  const dialog = useRef(null)
  const positions = useMemo(() => new Map(
    scenes.map((scene, index) => [scene.id, dragPosition?.id === scene.id ? dragPosition : positionFor(scene, index)]),
  ), [scenes, dragPosition])
  const connections = useMemo(() => sceneConnections(scenes), [scenes])

  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => { previous?.focus?.() }
  }, [])

  const bounds = useMemo(() => {
    let maxX = 900
    let maxY = 520
    for (const position of positions.values()) {
      maxX = Math.max(maxX, position.x + CARD_WIDTH + 80)
      maxY = Math.max(maxY, position.y + CARD_HEIGHT + 80)
    }
    return { width: maxX, height: maxY }
  }, [positions])

  function patchScenePosition(sceneId, position) {
    onScenesChange((current) => current.map((scene) => (
      scene.id === sceneId
        ? { ...scene, editorMapPosition: position }
        : scene
    )))
  }

  function resetLayout() {
    onScenesChange((current) => current.map((scene, index) => ({
      ...scene,
      editorMapPosition: fallbackPosition(index),
    })))
  }

  function finishDrag(event, commit) {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragPosition(null)
    if (commit && drag.position) patchScenePosition(drag.sceneId, drag.position)
  }

  return createPortal(
    <dialog ref={dialog} className="scene-map-dialog studio-scene-map" aria-label="Scene map" onCancel={(event) => { event.preventDefault(); onClose() }}>
      <header className="scene-map-dialog__header">
        <div>
          <div className="editor-eyebrow">Navigation map</div>
          <strong>See how the presentation connects</strong>
          <p>Lines come from navigation hotspot actions. Drag cards to organise the map; this does not change visitor navigation.</p>
        </div>
        <div className="button-row">
          <button type="button" onClick={resetLayout}>Auto arrange</button>
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      </header>

      <div className="scene-map-dialog__viewport">
        <div
          className="scene-map-canvas"
          style={{ width: bounds.width, height: bounds.height }}
        >
          <svg
            className="scene-map-links"
            width={bounds.width}
            height={bounds.height}
            viewBox={`0 0 ${bounds.width} ${bounds.height}`}
            aria-hidden="true"
          >
            <defs>
              <marker id="scene-map-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" />
              </marker>
            </defs>
            {connections.map((connection) => {
              const from = positions.get(connection.from)
              const to = positions.get(connection.to)
              if (!from || !to) return null
              const x1 = from.x + CARD_WIDTH / 2
              const y1 = from.y + CARD_HEIGHT / 2
              const x2 = to.x + CARD_WIDTH / 2
              const y2 = to.y + CARD_HEIGHT / 2
              return (
                <line
                  key={`${connection.from}-${connection.to}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  markerEnd="url(#scene-map-arrow)"
                />
              )
            })}
          </svg>

          {scenes.map((scene, index) => {
            const position = positions.get(scene.id) || fallbackPosition(index)
            const isCurrent = scene.id === currentSceneId
            const isStart = scene.id === startSceneId
            return (
              <article
                key={scene.id}
                className={`scene-map-node${isCurrent ? ' active' : ''}${dragPosition?.id === scene.id ? ' dragging' : ''}`}
                style={{ left: position.x, top: position.y, width: CARD_WIDTH, height: CARD_HEIGHT }}
              >
                <button
                  type="button"
                  className="scene-map-node__select"
                  onClick={() => {
                    onNavigate(scene.id)
                    onClose()
                  }}
                >
                  <strong>{scene.title || scene.id}</strong>
                  <span>{scene.group || 'Ungrouped'}</span>
                </button>
                <button
                  type="button"
                  className="scene-map-node__drag"
                  title="Drag to organise the map"
                  onPointerDown={(event) => {
                    if (event.button !== 0 || dragRef.current) return
                    event.stopPropagation()
                    const node = event.currentTarget.closest('.scene-map-node')
                    const rect = node?.getBoundingClientRect()
                    if (!rect) return
                    dragRef.current = {
                      sceneId: scene.id,
                      pointerId: event.pointerId,
                      offsetX: event.clientX - rect.left,
                      offsetY: event.clientY - rect.top,
                    }
                    event.currentTarget.setPointerCapture?.(event.pointerId)
                  }}
                  onPointerMove={(event) => {
                    const drag = dragRef.current
                    if (drag?.pointerId !== event.pointerId || drag.sceneId !== scene.id) return
                    const canvas = event.currentTarget.closest('.scene-map-canvas')
                    const rect = canvas?.getBoundingClientRect()
                    if (!rect) return
                    drag.position = {
                      x: Math.max(16, event.clientX - rect.left - drag.offsetX),
                      y: Math.max(16, event.clientY - rect.top - drag.offsetY),
                    }
                    setDragPosition({ id: scene.id, ...drag.position })
                  }}
                  onPointerUp={(event) => finishDrag(event, true)}
                  onPointerCancel={(event) => finishDrag(event, false)}
                  onLostPointerCapture={(event) => finishDrag(event, false)}
                >
                  Move
                </button>
                {isStart && <em>Start</em>}
              </article>
            )
          })}
        </div>
      </div>

      <footer className="scene-map-dialog__footer">
        <span>{scenes.length} scenes</span>
        <span>{connections.length} navigation connections</span>
        <span>Drag scene cards to make large projects easier to read.</span>
      </footer>
    </dialog>, document.body,
  )
}
