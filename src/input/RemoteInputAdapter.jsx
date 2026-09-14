import { useEffect } from 'react'
import { useInteraction } from '../contexts/InteractionContext'

export default function RemoteInputAdapter() {
  const interaction = useInteraction()
  useEffect(() => {
    const handler = (event) => {
      const detail = event.detail || {}
      if (typeof detail.action === 'string') interaction.dispatch(detail.action, { ...detail, source: detail.source || 'remote' })
    }
    window.addEventListener('3dvr-input', handler)
    // Future hardware/WebSocket adapters only need to dispatch this DOM event.
    window.__3dvrInput = (action, payload = {}) => window.dispatchEvent(new CustomEvent('3dvr-input', { detail: { action, ...payload } }))
    return () => { window.removeEventListener('3dvr-input', handler); try { delete window.__3dvrInput } catch {} }
  }, [interaction])
  return null
}
