import React from 'react'
import '../apps/account.css'
import { BackRow } from './ui/BackLink'

export default function EntryState({title, description, children, backTo='/', backLabel='Back to projects'}) {
  return <div className="account-ui account-shell"><header className="account-header"><a className="account-brand" href="/"><img src="/brand/3dvr-portal-v2.svg" width="30" height="30" alt="" />Atria <span className="account-brand-divider">Studio</span></a></header><main className="account-state"><BackRow href={backTo}>{backLabel}</BackRow><section className="account-panel"><div className="account-eyebrow">ATRIA STUDIO</div><h1>{title}</h1><p>{description}</p><div className="account-actions">{children}</div></section></main></div>
}
