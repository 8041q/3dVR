import { useEffect } from 'react'

export default function useDismissibleMenus() {
  useEffect(() => {
    const openMenus = () => [...document.querySelectorAll('details[data-menu][open]')]
    const outside = event => openMenus().forEach(menu => { if (!menu.contains(event.target)) menu.open = false })
    const toggle = event => {
      const menu = event.target
      if (menu.matches?.('details[data-menu][open]')) openMenus().forEach(other => { if (other !== menu) other.open = false })
    }
    const escape = event => {
      if (event.key !== 'Escape') return
      const menu = openMenus().at(-1)
      if (!menu) return
      event.preventDefault(); event.stopPropagation()
      menu.open = false
      menu.querySelector('summary')?.focus()
    }
    const choose = event => {
      const menu = event.target.closest?.('details[data-menu][open]')
      if (menu && event.target.closest('button,a')) { menu.open = false; menu.querySelector('summary')?.focus() }
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside)
    document.addEventListener('toggle', toggle, true)
    document.addEventListener('keydown', escape, true)
    document.addEventListener('click', choose)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('toggle', toggle, true)
      document.removeEventListener('keydown', escape, true)
      document.removeEventListener('click', choose)
    }
  }, [])
}
