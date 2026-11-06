import test from 'node:test'
import assert from 'node:assert/strict'
import { arrangeSceneGraph, sceneGraph, sceneMapPositions, MAP_CARD } from '../src/editor/sceneGraph.js'

const scenes = [
  { id:'a', hotspots:[{id:'door',label:'Door',actions:[{type:'navigate-scene',sceneId:'b'},{type:'navigate-scene',sceneId:'c'}]},{id:'second',actions:[{type:'navigate-scene',sceneId:'b'}]}] },
  { id:'b', hotspots:[{id:'back',actions:[{type:'navigate-scene',sceneId:'a'}]}] },
  { id:'c', hotspots:[] },
  { id:'island', hotspots:[{id:'broken',actions:[{type:'navigate-scene',sceneId:'missing'}]}] },
]
test('scene graph follows effective navigation and detects unreachable and broken destinations', () => {
  const graph=sceneGraph(scenes,'a')
  assert.equal(graph.edges.length,3)
  assert.deepEqual(graph.outgoing.get('a').find(edge=>edge.to==='b').labels,['second'],'an earlier navigation action cannot make an overwritten destination appear reachable')
  assert.deepEqual(graph.reachable,new Set(['a','b','c']))
  assert.equal(graph.outgoing.get('c').length,0)
  assert.equal(graph.incoming.get('b').length,1)
  assert.deepEqual(graph.broken,[{sceneId:'island',hotspotId:'broken',target:'missing'}])
})
test('automatic map layout follows routes, handles cycles and leaves disconnected scenes visible without changing navigation', () => {
  const before=JSON.stringify(scenes)
  const result=arrangeSceneGraph(scenes,'a')
  assert.equal(JSON.stringify(scenes),before)
  assert.deepEqual(sceneGraph(result,'a').edges,sceneGraph(scenes,'a').edges)
  assert.ok(result[1].editorMapPosition.x>result[0].editorMapPosition.x)
  for(let i=0;i<result.length;i++) for(let j=i+1;j<result.length;j++) {
    const a=result[i].editorMapPosition,b=result[j].editorMapPosition
    assert.ok(Math.abs(a.x-b.x)>=MAP_CARD.width || Math.abs(a.y-b.y)>=MAP_CARD.height,'cards do not overlap')
  }
})

test('implicit map positions avoid existing manual cards without moving those cards', () => {
  const manual={x:332,y:48}
  const partial=scenes.map(scene=>scene.id==='a'?{...scene,editorMapPosition:manual}:scene)
  const positions=sceneMapPositions(partial,'a')
  assert.deepEqual(positions.get('a'),manual)
  const values=[...positions.values()]
  for(let i=0;i<values.length;i++) for(let j=i+1;j<values.length;j++) assert.ok(Math.abs(values[i].x-values[j].x)>=MAP_CARD.width || Math.abs(values[i].y-values[j].y)>=MAP_CARD.height)
  assert.equal(scenes[0].editorMapPosition,undefined)
})
