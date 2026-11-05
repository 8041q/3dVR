import React, { useCallback, useEffect, useState } from 'react'
import * as THREE from 'three'
import MultiResPanorama from './MultiResPanorama'
import { usePanoramaManifest } from '../panorama/usePanoramaManifest'

function LegacyPanorama({ image, opacity, radius, onStatus }) {
  const [texture, setTexture] = useState(null)
  const [status, setStatus] = useState({ state: 'loading' })
  useEffect(() => onStatus?.(status), [onStatus, status])

  useEffect(() => {
    let active = true
    let ownedTexture
    const timeout = window.setTimeout(() => {
      if (active) setStatus({ state: 'error', message: 'The panorama image took too long to load.' })
    }, 15000)
    new THREE.TextureLoader().load(image, (loaded) => {
      window.clearTimeout(timeout)
      if (!active) {
        loaded.dispose()
        return
      }
      ownedTexture = loaded
      loaded.colorSpace = THREE.SRGBColorSpace
      loaded.wrapS = THREE.RepeatWrapping
      loaded.repeat.x = -1
      loaded.offset.x = 1
      loaded.needsUpdate = true
      setTexture(loaded)
      setStatus({ state: 'ready' })
    }, undefined, () => {
      window.clearTimeout(timeout)
      if (active) setStatus({ state: 'error', message: 'The panorama image couldn’t load.' })
    })
    return () => {
      active = false
      window.clearTimeout(timeout)
      ownedTexture?.dispose()
    }
  }, [image])

  if (!texture) return null
  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} transparent={opacity < 1} opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

export default function ScenePanorama({ scene, opacity = 1, radius = 50, onStatus }) {
  const manifestUrl = scene?.panorama?.manifestUrl
  const { manifest, error } = usePanoramaManifest(manifestUrl)
  const [failedTiles, setFailedTiles] = useState(false)
  const hasFallback = Boolean(scene?.image)
  const showFallback = !manifestUrl || Boolean(error) || failedTiles
  const onTiledStatus = useCallback((status) => {
    if (status.state === 'error' && hasFallback) setFailedTiles(true)
    else onStatus?.(status)
  }, [hasFallback, onStatus])
  const onImageStatus = useCallback((status) => {
    onStatus?.(status.state === 'ready' && manifestUrl
      ? { ...status, message: 'Showing the backup image because the panorama tiles couldn’t load.' }
      : status)
  }, [manifestUrl, onStatus])

  useEffect(() => {
    if (!manifestUrl && !hasFallback) onStatus?.({ state: 'error', message: 'This scene has no panorama.' })
    else if (error && !hasFallback) onStatus?.({ state: 'error', message: 'The tiled panorama couldn’t load.' })
    else if (manifestUrl && !manifest && !showFallback) onStatus?.({ state: 'loading' })
  }, [error, hasFallback, manifest, manifestUrl, onStatus, showFallback])

  if (manifest && !showFallback) {
    return <MultiResPanorama manifest={manifest} opacity={opacity} radius={radius} onStatus={onTiledStatus} />
  }
  if (showFallback && hasFallback) {
    return <LegacyPanorama image={scene.image} opacity={opacity} radius={radius} onStatus={onImageStatus} />
  }
  return null
}
