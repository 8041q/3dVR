import { useEffect } from 'react'
import { useInteraction } from '../contexts/InteractionContext'
import { INPUT_ACTIONS } from './actions'

export default function KeyboardInput() {
  const interaction = useInteraction()
  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target?.closest?.('input, textarea, select, [role="combobox"], [role="listbox"], [contenteditable]:not([contenteditable="false"])')) return
      if ((event.key === 'Enter' || event.key === ' ') && target?.closest?.('button, a, summary, [role="button"]')) return
      if (event.key === 'Enter' || event.key === ' ') interaction.dispatch(INPUT_ACTIONS.SELECT, { source: 'keyboard' })
      if (event.key === 'Escape' || event.key === 'Backspace') interaction.dispatch(INPUT_ACTIONS.BACK, { source: 'keyboard' })
      if (event.key === 'ArrowRight') interaction.dispatch(INPUT_ACTIONS.NEXT, { source: 'keyboard' })
      if (event.key === 'ArrowLeft') interaction.dispatch(INPUT_ACTIONS.PREVIOUS, { source: 'keyboard' })
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [interaction])
  return null
}
