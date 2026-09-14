import React, { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import ScenePanorama from './ScenePanorama'

export default function PanoramaTransition({ scene, duration = 0.55 }) {
  const [current, setCurrent] = useState(scene)
  const [outgoing, setOutgoing] = useState(null)
  const [progress, setProgress] = useState(1)
  const currentRef = useRef(scene)

  useEffect(() => {
    if (!scene || scene.id === currentRef.current?.id) {
      if (scene && scene !== currentRef.current) {
        currentRef.current = scene
        setCurrent(scene)
      }
      return
    }

    setOutgoing(currentRef.current)
    currentRef.current = scene
    setCurrent(scene)
    setProgress(0)
  }, [scene])

  useFrame((_state, delta) => {
    if (progress >= 1) return
    const next = Math.min(1, progress + delta / duration)
    setProgress(next)
    if (next >= 1) setOutgoing(null)
  })

  return (
    <>
      {outgoing && <ScenePanorama scene={outgoing} opacity={1 - progress} />}
      {current && <ScenePanorama scene={current} opacity={progress} />}
    </>
  )
}
