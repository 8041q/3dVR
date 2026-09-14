import { useEffect } from 'react'
import { useInteraction } from '../contexts/InteractionContext'
import { INPUT_ACTIONS } from './actions'

export default function KeyboardInput() {
  const interaction = useInteraction()
  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat) return
      if (event.key === 'Enter' || event.key === ' ') interaction.dispatch(INPUT_ACTIONS.SELECT, { source: 'keyboard' })
      if (event.key === 'Escape' || event.key === 'Backspace') interaction.dispatch(INPUT_ACTIONS.BACK, { source: 'keyboard' })
      if (event.key === 'ArrowRight') interaction.dispatch(INPUT_ACTIONS.NEXT, { source: 'keyboard' })
      if (event.key === 'ArrowLeft') interaction.dispatch(INPUT_ACTIONS.PREVIOUS, { source: 'keyboard' })
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [interaction])
  return null
}
