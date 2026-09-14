import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { INPUT_ACTIONS } from '../input/actions'

const InteractionContext = createContext(null)

export function InteractionProvider({ children, onBack, onNext, onPrevious, onHome, onResetView }) {
  const focusedRef = useRef(null)
  const [focusedId, setFocusedId] = useState(null)

  const setFocusedTarget = useCallback((object) => {
    focusedRef.current = object || null
    setFocusedId(object?.userData?.interactionId || null)
  }, [])

  const activateObject = useCallback((object, source = 'unknown') => {
    let current = object
    while (current) {
      if (current.userData?.interactionTarget && typeof current.userData?.activate === 'function') {
        current.userData.activate({ source, object: current })
        return true
      }
      current = current.parent
    }
    return false
  }, [])

  const dispatch = useCallback((action, payload = {}) => {
    switch (action) {
      case INPUT_ACTIONS.SELECT: return activateObject(payload.object || focusedRef.current, payload.source || 'action')
      case INPUT_ACTIONS.BACK: onBack?.(); return true
      case INPUT_ACTIONS.NEXT: onNext?.(); return true
      case INPUT_ACTIONS.PREVIOUS: onPrevious?.(); return true
      case INPUT_ACTIONS.HOME: onHome?.(); return true
      case INPUT_ACTIONS.RESET_VIEW: onResetView?.(); return true
      default: return false
    }
  }, [activateObject, onBack, onNext, onPrevious, onHome, onResetView])

  const value = useMemo(() => ({ focusedId, setFocusedTarget, activateObject, dispatch }), [focusedId, setFocusedTarget, activateObject, dispatch])
  return <InteractionContext.Provider value={value}>{children}</InteractionContext.Provider>
}

export function useInteraction() { return useContext(InteractionContext) }
