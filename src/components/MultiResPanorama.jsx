import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { panoramaTextureCache } from '../panorama/TextureLRU'
import { tileDirection, tileTransform } from '../panorama/cubemapGeometry'
import { basePanoramaTiles, panoramaTileUrl } from '../panorama/panoramaSource'

function chooseLevel(manifest,camera,size) { const vf=THREE.MathUtils.degToRad(camera.fov||75); const hf=2*Math.atan(Math.tan(vf/2)*Math.max(1,size.width/Math.max(1,size.height))); const desired=size.width/Math.max(.01,hf)*(Math.PI/2); let best=manifest.levels[0]; for(const l of manifest.levels){best=l;if(l.faceSize>=desired*1.15)break} return best }
function visible(manifest,level,camera,size){const d=new THREE.Vector3();camera.getWorldDirection(d);const vf=THREE.MathUtils.degToRad(camera.fov||75);const hf=2*Math.atan(Math.tan(vf/2)*Math.max(1,size.width/Math.max(1,size.height)));const diagonal=Math.sqrt(vf*vf+hf*hf)/2+THREE.MathUtils.degToRad(22);const out=[];for(const f of manifest.faces.map(x=>x.id))for(let row=0;row<level.tilesPerEdge;row++)for(let col=0;col<level.tilesPerEdge;col++){const td=tileDirection(f,col,row,level.tilesPerEdge);const margin=(Math.PI/2)/level.tilesPerEdge; if(d.dot(td)>=Math.cos(Math.min(Math.PI,diagonal+margin)))out.push({face:f,row,col,level})}return out}
const key=(t)=>`${t.level.id}:${t.face}:${t.row}:${t.col}`

function Tile({ tile, radius, opacity, order, onBaseTile }) {
  const [texture, setTexture] = useState(null)
  const url = panoramaTileUrl(tile)
  const tileId = key(tile)
  const transform = useMemo(() => tileTransform(tile.face, tile.col, tile.row, tile.level.tilesPerEdge, radius, order ? .03 : .01),
    [tile, radius, order])
  useEffect(() => {
    let active = true
    panoramaTextureCache.acquire(url).then((loaded) => {
      if (!active) return
      setTexture(loaded)
      onBaseTile?.(tileId, true)
    }).catch(() => {
      if (active) onBaseTile?.(tileId, false)
    })
    return () => {
      active = false
      panoramaTextureCache.release(url)
    }
  }, [url, tileId, onBaseTile])
  if (!texture) return null
  return (
    <mesh {...transform} renderOrder={order} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} transparent={opacity < 1} opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

export default function MultiResPanorama({ manifest, opacity = 1, radius = 50, gpuBudgetBytes = 192 * 1024 * 1024, onStatus }) {
  const { camera, size } = useThree()
  const [detail, setDetail] = useState([])
  const signature = useRef('')
  const lastUpdate = useRef(0)
  useEffect(() => panoramaTextureCache.setBudget(gpuBudgetBytes), [gpuBudgetBytes])

  const baseLevel = manifest.levels.find((level) => level.id === manifest.baseLevel) || manifest.levels[0]
  const base = useMemo(() => basePanoramaTiles(manifest), [manifest])
  const [loaded, setLoaded] = useState(0)
  const [failed, setFailed] = useState(false)
  const seen = useRef(new Set())
  const onBaseTile = React.useCallback((id, ok) => {
    if (!ok) {
      setFailed(true)
      return
    }
    seen.current.add(id)
    setLoaded(seen.current.size)
  }, [])
  useEffect(() => {
    if (failed) onStatus?.({ state: 'error', message: 'Some panorama tiles couldn’t load.' })
    else if (loaded === base.length) onStatus?.({ state: 'ready' })
  }, [base.length, failed, loaded, onStatus])
  useEffect(() => {
    if (failed || loaded === base.length) return undefined
    const timeout = window.setTimeout(() => setFailed(true), 15000)
    return () => window.clearTimeout(timeout)
  }, [base.length, failed, loaded === base.length])

  useFrame(({ clock }) => {
    const now = clock.elapsedTime * 1000
    if (now - lastUpdate.current < 180) return
    lastUpdate.current = now
    const level = chooseLevel(manifest, camera, size)
    if (level.id === baseLevel.id) {
      if (signature.current) {
        signature.current = ''
        setDetail([])
      }
      return
    }

    const next = visible(manifest, level, camera, size)
    const nextSignature = next.map(key).sort().join('|')
    if (nextSignature !== signature.current) {
      signature.current = nextSignature
      setDetail(next)
    }
  })

  return (
    <group>
      {base.map((tile) => <Tile key={`b:${key(tile)}`} tile={tile} radius={radius} opacity={opacity} order={0} onBaseTile={onBaseTile} />)}
      {detail.map((tile) => <Tile key={`d:${key(tile)}`} tile={tile} radius={radius} opacity={opacity} order={1} />)}
    </group>
  )
}
