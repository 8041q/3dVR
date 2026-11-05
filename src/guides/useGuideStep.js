import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { guideAdvanceDelay } from './guidePlayback.js'

export function useGuideStep({ entryKey, step, sceneId, destinationId, ready = true, onNavigate, onActivate, onAdvance }) {
  const [enteredKey, setEnteredKey] = useState('')
  const requestedKey = useRef('')
  const activatedKey = useRef('')
  const entered = Boolean(entryKey && enteredKey === entryKey)
  const canRun = entered && ready && (!destinationId || destinationId === sceneId)
  const delay = guideAdvanceDelay(step)
  const navigate = useEffectEvent(onNavigate)
  const activate = useEffectEvent(onActivate)
  const advance = useEffectEvent(onAdvance)

  useEffect(() => {
    if (!entryKey || entered) return
    if (!destinationId || destinationId === sceneId) {
      setEnteredKey(entryKey)
    } else if (requestedKey.current !== entryKey) {
      requestedKey.current = entryKey
      navigate(destinationId)
    }
  }, [destinationId, entered, entryKey, sceneId])

  useEffect(() => {
    if (!canRun) return undefined
    if (step?.autoActivateHotspotId && activatedKey.current !== entryKey) {
      activatedKey.current = entryKey
      activate(step.autoActivateHotspotId)
    }
    const timer = delay > 0 ? window.setTimeout(() => advance(entryKey), delay) : null
    return () => {
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [canRun, delay, entryKey, step?.autoActivateHotspotId])

  return { entered }
}
