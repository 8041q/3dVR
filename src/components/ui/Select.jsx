import React, { Children, Fragment, forwardRef, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function optionsFrom(children, groupDisabled = false) {
  return Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child)) return []
    if (child.type === Fragment || child.type === 'optgroup') return optionsFrom(child.props.children, groupDisabled || child.props.disabled)
    if (child.type !== 'option') return []
    const label = Children.toArray(child.props.children).join('')
    return [{ value: String(child.props.value ?? label), label, disabled: groupDisabled || child.props.disabled }]
  })
}

const Select = forwardRef(function Select({ children, value, defaultValue, onChange, disabled, className = '', id, name, required, ...props }, forwardedRef) {
  const uid = useId()
  const menuId = `${uid}-options`
  const trigger = useRef(null), native = useRef(null), menu = useRef(null)
  const [open, setOpen] = useState(false)
  const [internal, setInternal] = useState(defaultValue)
  const [active, setActive] = useState(-1)
  const [position, setPosition] = useState(null)
  const [label, setLabel] = useState('')
  const search = useRef({ text: '', time: 0 })
  const options = optionsFrom(children)
  const current = String(value ?? internal ?? options[0]?.value ?? '')
  const selected = options.find((option) => option.value === current)
  const dark = trigger.current?.closest('.viewer-controls') != null
  const close = () => { setOpen(false); setPosition(null) }
  const choose = (index) => {
    const option = options[index]
    if (!option || option.disabled) return
    native.current.value = option.value
    setInternal(option.value)
    onChange?.({ target: native.current, currentTarget: native.current, type: 'change', preventDefault() {}, stopPropagation() {} })
    close(); trigger.current?.focus()
  }
  const show = () => { if (disabled) return; setActive(Math.max(0, options.findIndex((option) => option.value === current && !option.disabled))); setOpen(true) }

  useEffect(() => {
    const owner = trigger.current?.closest('label')
    if (owner) setLabel([...owner.childNodes].filter((node) => node !== trigger.current.parentElement).map((node) => node.textContent).join(' ').trim())
  }, [])
  useEffect(() => { if (disabled) close() }, [disabled])
  useLayoutEffect(() => {
    if (!open) return undefined
    const place = () => {
      const rect = trigger.current.getBoundingClientRect()
      const above = window.innerHeight - rect.bottom < 210 && rect.top > window.innerHeight - rect.bottom
      const available = (above ? rect.top : window.innerHeight - rect.bottom) - 16
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(Math.max(rect.width, 160), window.innerWidth - 16) - 8)),
        width: Math.min(Math.max(rect.width, 160), window.innerWidth - 16), maxHeight: Math.max(60, Math.min(300, available)),
        ...(above ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) })
    }
    place()
    const outside = (event) => { if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close() }
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])
  useEffect(() => { if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active, open])

  const move = (delta) => {
    let next = active
    for (let i = 0; i < options.length; i++) { next = (next + delta + options.length) % options.length; if (!options[next].disabled) { setActive(next); return } }
  }
  return <span className={`ui-select ${className}`} data-open={open || undefined}>
    <select ref={native} hidden aria-hidden="true" tabIndex={-1} name={name} required={required} disabled={disabled} value={current} onChange={() => {}}>{children}</select>
    <button {...props} ref={(node) => { trigger.current = node; if (typeof forwardedRef === 'function') forwardedRef(node); else if (forwardedRef) forwardedRef.current = node }} id={id}
      type="button" className="ui-select__trigger" role="combobox" disabled={disabled} aria-label={props['aria-label'] || label || undefined}
      aria-expanded={open} aria-controls={menuId} aria-haspopup="listbox" aria-activedescendant={open ? `${menuId}-${active}` : undefined}
      onClick={() => open ? close() : show()} onBlur={(event) => { if (!menu.current?.contains(event.relatedTarget)) close() }}
      onKeyDown={(event) => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation() }
        if (event.key === 'Escape') { close(); return }
        if (event.key === 'Tab') { close(); return }
        if (event.key === 'Enter' || event.key === ' ') { if (open) choose(active); else show(); return }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { if (!open) show(); else move(event.key === 'ArrowDown' ? 1 : -1); return }
        if (event.key === 'Home') { if (!open) show(); setActive(options.findIndex((option) => !option.disabled)); return }
        if (event.key === 'End') { if (!open) show(); setActive(options.findLastIndex((option) => !option.disabled)); return }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          event.preventDefault(); event.stopPropagation()
          const now = Date.now(); search.current.text = now - search.current.time > 700 ? event.key : search.current.text + event.key; search.current.time = now
          const index = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(search.current.text.toLowerCase()))
          if (!open) show(); if (index >= 0) setActive(index)
        }
      }}>
      <span className="ui-select__value">{selected?.label || 'Choose an option'}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    </button>
    {open && position && createPortal(<div ref={menu} id={menuId} role="listbox" aria-label={props['aria-label'] || label || 'Options'} className="ui-select-menu" data-theme={dark ? 'dark' : 'light'} data-viewer-ui-lock style={position}>
      {options.map((option, index) => <div key={`${option.value}-${index}`} id={`${menuId}-${index}`} role="option" aria-selected={option.value === current} aria-disabled={option.disabled || undefined}
        data-index={index} data-active={index === active || undefined} onPointerMove={() => !option.disabled && setActive(index)}
        onPointerDown={(event) => event.preventDefault()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); choose(index) }}>
        <span>{option.label}</span><span aria-hidden="true">{option.value === current ? '✓' : ''}</span>
      </div>)}
    </div>, trigger.current.closest('dialog') || document.body)}
  </span>
})
export default Select
