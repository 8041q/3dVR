import React from 'react'
import './backNavigation.css'

export default function BackLink({ href, children='Back', onClick, disabled=false, className='', ...props }) {
  const content=<><span className="ui-back-link__arrow" aria-hidden="true">←</span><span>{children}</span></>
  const classes=`ui-back-link ${className}`.trim()
  if(href) return <a {...props} className={classes} href={href} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} onClick={event=>{if(disabled)event.preventDefault();else onClick?.(event)}}>{content}</a>
  return <button {...props} className={classes} type="button" disabled={disabled} onClick={onClick}>{content}</button>
}

export function BackRow({ className='', ...props }) {
  return <div className={`ui-back-row ${className}`.trim()}><BackLink {...props} /></div>
}
