import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import ScenePanorama from './ScenePanorama'
import { panoramaKey } from '../panorama/panoramaSource'

export default function PanoramaTransition({ scene, duration = 0.55, onStatus }) {
  const [current, setCurrent] = useState(scene)
  const [outgoing, setOutgoing] = useState(null)
  const [progress, setProgress] = useState(1)
  const currentRef = useRef(scene)
  const ready = useRef(false)
  const currentKey = panoramaKey(current)
  const onCurrentStatus = useCallback((status) => {
    ready.current = status.state === 'ready'
    if (status.state === 'error') {
      setOutgoing(null)
      setProgress(1)
    }
    onStatus?.({ ...status, key: currentKey })
  }, [currentKey, onStatus])

  useEffect(() => {
    if (!scene || scene.id === currentRef.current?.id) {
      if (scene && scene !== currentRef.current) {
        currentRef.current = scene
        setCurrent(scene)
      }
      return
    }

    setOutgoing(ready.current ? currentRef.current : null)
    ready.current = false
    currentRef.current = scene
    setCurrent(scene)
    setProgress(0)
  }, [scene])

  useFrame((_state, delta) => {
    if (progress >= 1 || !ready.current) return
    const next = Math.min(1, progress + delta / duration)
    setProgress(next)
    if (next >= 1) setOutgoing(null)
  })

  return (
    <>
      {outgoing && <ScenePanorama key={panoramaKey(outgoing)} scene={outgoing} radius={51} />}
      {current && <ScenePanorama key={currentKey} scene={current} opacity={outgoing ? progress : 1} onStatus={onCurrentStatus} />}
    </>
  )
}
