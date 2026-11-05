import React, { useId, useRef, useState } from 'react'

export default function Autocomplete({ value = '', options = [], onChange, ...props }) {
  const id = useId(), root = useRef(null)
  const [open, setOpen] = useState(false), [active, setActive] = useState(0)
  const matches = options.filter((option) => option.toLowerCase() !== value.toLowerCase() && option.toLowerCase().includes(value.toLowerCase()))
  const choose = (option) => { onChange(option); setOpen(false) }
  return <span ref={root} className="ui-autocomplete">
    <input {...props} value={value} role="combobox" aria-autocomplete="list" aria-expanded={open && matches.length > 0} aria-controls={`${id}-options`}
      aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined} onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(0) }}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key)) event.stopPropagation()
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
        if (event.key === 'Enter' && open && matches[active]) { event.preventDefault(); choose(matches[active]) }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive((index) => matches.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length : 0) }
      }} />
    {open && matches.length > 0 && <span className="ui-select-menu ui-autocomplete__menu" id={`${id}-options`} role="listbox">
      {matches.map((option,index) => <span key={option} id={`${id}-${index}`} role="option" aria-selected={index === active} data-active={index === active || undefined} onPointerDown={(event) => event.preventDefault()} onClick={(event) => { event.preventDefault(); choose(option) }}>{option}</span>)}
    </span>}
  </span>
}
