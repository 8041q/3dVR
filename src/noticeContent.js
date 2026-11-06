import { Children, isValidElement } from 'react'
export function hasNoticeContent(children) {
  return Children.toArray(children).some(child => {
    if(typeof child==='string' || typeof child==='number') return String(child).trim().length>0
    return isValidElement(child) && hasNoticeContent(child.props.children)
  })
}
