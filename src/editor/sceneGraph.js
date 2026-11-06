import { ACTION_TYPES, hotspotDestination, normalizeHotspotActions } from '../actions/actionTypes.js'

export const MAP_CARD = { width: 220, height: 116 }

export function sceneGraph(scenes, startId) {
  const ids = new Set(scenes.map(scene => scene.id)), links = new Map(), broken = []
  for (const scene of scenes) for (const hotspot of scene.hotspots || []) {
    for (const action of normalizeHotspotActions(hotspot)) if (action.type === ACTION_TYPES.NAVIGATE_SCENE && !ids.has(action.sceneId)) broken.push({ sceneId: scene.id, hotspotId: hotspot.id, target: action.sceneId })
    // Match the viewer: the last valid navigation in one hotspot wins.
    const destination = hotspotDestination(hotspot, scene.id, ids)
    if (!destination) continue
    const key = JSON.stringify([scene.id, destination])
    if (!links.has(key)) links.set(key, { id: key, from: scene.id, to: destination, labels: [] })
    const labels = links.get(key).labels
    if (!labels.includes(hotspot.label || hotspot.id)) labels.push(hotspot.label || hotspot.id)
  }
  const edges = [...links.values()]
  const incoming = new Map(scenes.map(scene => [scene.id, edges.filter(edge => edge.to === scene.id)]))
  const outgoing = new Map(scenes.map(scene => [scene.id, edges.filter(edge => edge.from === scene.id)]))
  const reachable = new Set(ids.has(startId) ? [startId] : [])
  for (const id of reachable) for (const edge of outgoing.get(id) || []) reachable.add(edge.to)
  return { edges, incoming, outgoing, reachable, broken }
}

export function arrangeSceneGraph(scenes, startId) {
  const graph = sceneGraph(scenes, startId), levels = new Map(), queue = scenes.some(scene => scene.id === startId) ? [startId] : []
  if (queue.length) levels.set(startId, 0)
  for (let i = 0; i < queue.length; i++) for (const edge of graph.outgoing.get(queue[i]) || []) if (!levels.has(edge.to)) {
    levels.set(edge.to, levels.get(queue[i]) + 1); queue.push(edge.to)
  }
  const disconnectedLevel = Math.max(0, ...levels.values()) + 1, rows = new Map()
  return scenes.map(scene => {
    const level = levels.get(scene.id) ?? disconnectedLevel, row = rows.get(level) || 0
    rows.set(level, row + 1)
    return { ...scene, editorMapPosition: { x: 48 + level * 284, y: 48 + row * 164 } }
  })
}

export function sceneMapPositions(scenes, startId) {
  const arranged = arrangeSceneGraph(scenes, startId)
  const positions = new Map(scenes.filter(scene => Number.isFinite(scene.editorMapPosition?.x) && Number.isFinite(scene.editorMapPosition?.y)).map(scene => [scene.id, scene.editorMapPosition]))
  for (const scene of arranged) {
    if (positions.has(scene.id)) continue
    const candidate = { ...scene.editorMapPosition }
    while ([...positions.values()].some(pos => Math.abs(pos.x - candidate.x) < MAP_CARD.width + 24 && Math.abs(pos.y - candidate.y) < MAP_CARD.height + 24)) candidate.y += 164
    positions.set(scene.id, candidate)
  }
  return positions
}
