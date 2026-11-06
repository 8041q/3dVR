import React from 'react'
import '../apps/account.css'

export default function EntryState({title, description, children}) {
  return <div className="account-ui account-shell"><header className="account-header"><a className="account-brand" href="/"><img src="/brand/3dvr-portal-v2.svg" width="30" height="30" alt="" />Atria <span className="account-brand-divider">Studio</span></a></header><main className="account-state"><section className="account-panel"><div className="account-eyebrow">ATRIA STUDIO</div><h1>{title}</h1><p>{description}</p><div className="account-actions">{children}</div></section></main></div>
}
