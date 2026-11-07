import React, { useEffect, useState } from 'react'
import { useAuth, accountRequest } from '../contexts/AuthContext'
import LoginModal from '../components/LoginModal'
import AuthenticatorSetup from '../components/AuthenticatorSetup'
import { Avatar, CopyButton, Notice, PanelHeading, PasswordField } from '../components/accountUi'
import AvatarSettings from '../components/AvatarSettings'
import Select from '../components/ui/Select'
import './account.css'
import { activationToken, safeReturnPath } from '../accountFlow'
import ProjectImport from '../components/ProjectImport'
import { PROJECT_METADATA_LIMITS } from '../projectMetadata'
import DeviceSessions from '../components/DeviceSessions'
import AccountDeletionDialog from '../components/AccountDeletionDialog'
import { BackRow } from '../components/ui/BackLink'
import AboutAtria from '../components/AboutAtria'
import ServerConsole from '../components/ServerConsole'

export default function AccountApp({ notice, returnTo }) {
  const auth = useAuth()
  const [invite, setInvite] = useState(() => new URLSearchParams(location.hash.slice(1)).get('invite'))
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab'))
  const [previousTab, setPreviousTab] = useState(null)
  const [initialSetup,setInitialSetup]=useState(null), [preparing,setPreparing]=useState(false)
  const [projectId, setProjectId] = useState(() => new URLSearchParams(location.search).get('project'))
  const owner = auth.user?.role === 'owner'
  const pending = owner && !auth.user.twoFactorEnabled
  const needsSetup = ['needs-initialization','needs-activation'].includes(auth.installation?.state)
  const destination=safeReturnPath(returnTo)
  const active = tab || (projectId ? 'sharing' : 'projects')
  useEffect(() => {if(destination && auth.isEditor && !invite && active!=='about') location.replace(destination)},[destination,auth.user?.id,auth.isEditor,invite,active])
  useEffect(() => { if (invite) history.replaceState(null, '', location.pathname + location.search) }, [])
  async function finishActivation(signedIn,password) {
    setPreparing(true);setError('')
    let ownerSetup=false
    try {
      if(signedIn) {
        const user=await auth.refresh()
        ownerSetup=user?.role==='owner' && !user.twoFactorEnabled
        if(user?.role==='owner' && !user.twoFactorEnabled) {
          try {setInitialSetup(await accountRequest('/api/auth/two-factor/enable',{password}))}
          catch(failure){setError('Your password is saved. Confirm it below to prepare your authenticator.')}
        }
      }
      setInvite(null)
      setMessage(signedIn ? ownerSetup ? 'Password created. Connect your authenticator below.' : 'Your account is ready.' : 'Your password is set. Sign in below to continue.')
    } catch(failure) {setError(failure.message);setInvite(null)}
    finally {setPreparing(false)}
  }
  async function logout() {
    setBusy(true);setError('')
    try {await auth.logout();setInitialSetup(null);setTab(null);setMessage('You’re signed out.')}
    catch (failure) {setError(failure.message)}
    finally {setBusy(false)}
  }
  useEffect(()=> {
    const changed=()=>{const query=new URLSearchParams(location.search);setProjectId(query.get('project'));setTab(query.get('tab'));setError('');setMessage('')}
    window.addEventListener('popstate',changed)
    return ()=>window.removeEventListener('popstate',changed)
  },[])
  function showTab(value) {
    if (value !== active) setPreviousTab(active)
    setTab(value);setError('');setMessage('')
    if(value!=='sharing')setProjectId(null)
    history.pushState(null,'',value==='projects'?'/':'/account'+(value==='sharing'?'?project='+encodeURIComponent(projectId):'?tab='+encodeURIComponent(value)))
  }
  function share(id) {setProjectId(id);setTab('sharing');setError('');setMessage('');history.pushState(null,'','/account?project='+encodeURIComponent(id)+'&from=projects')}
  const fromEditor=active==='sharing' && new URLSearchParams(location.search).get('from')==='editor'
  function goBack(){if(fromEditor && projectId)location.href='/editor/'+encodeURIComponent(projectId);else if(previousTab){const back=previousTab;setPreviousTab(null);showTab(back)}else showTab('projects')}
  const tabs = owner ? [['projects','Projects'],['users','Users'],['server','Server'],['security','Security'],['about','About']] : [['projects','Projects'],['security','Security'],['about','About']]
  if (projectId) tabs.splice(1,0,['sharing','Project access'])
  return <div className="account-ui account-shell">
    <header className="account-header">
      <a className="account-brand" href="/"><img src="/brand/3dvr-portal-v2.svg" width="40" height="40" alt="" /><span>Atria<span className="account-brand-divider">Studio</span></span></a>
      <span className="account-header-label">{auth.user ? owner && ['users','server'].includes(active) ? 'Server administration' : 'Your workspace' : 'Account'}</span>
      {auth.user && <div className="account-header-user">
        <button className="account-user" type="button" title={auth.user.email} aria-label={`${auth.user.name || 'Your account'}, open account settings`} onClick={() => showTab('security')}>
          <Avatar name={auth.user.name || auth.user.email} src={auth.user.avatarUrl} />
          <span className="account-user-text"><span className="account-user-name">{auth.user.name || 'User'}</span><span className="account-user-role">{owner ? 'Owner' : 'Member'}</span></span>
        </button>
        <button className="account-signout" type="button" title="Sign out" aria-label="Sign out" disabled={busy} onClick={logout}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
        </button>
      </div>}
    </header>
    {auth.checking ? <main className="account-loading" role="status">Checking your session…</main>
      : invite || !auth.user ? active==='about' ? <main className="account-content"><AboutAtria /></main> : <main className="account-auth-layout">
        <aside className="account-welcome"><div className="account-eyebrow">YOUR SPACE TO CREATE</div><h2>Bring your<br />world into view.</h2><p>Build immersive tours. Shape your scenes.<br />Share the experience.</p><div className="account-welcome-art" aria-hidden="true"><div /><div /><div /><span>360°</span></div><span className="account-welcome-foot">Atria · Self-hosted, by you.</span></aside>
        <div className="account-auth-card"><div className="account-entry"><Notice error>{auth.sessionError}</Notice>{invite ? <Activation token={invite} onComplete={finishActivation} /> : needsSetup ? <ServerSetup state={auth.installation.state} onActivate={setInvite} /> : <LoginModal embedded notice={message || notice || (auth.installation?.state==='needs-authenticator' ? 'Sign in to finish your owner account setup.' : '')} />}</div></div>
      </main> : <>
        {!pending && <nav className="account-nav" aria-label="Account sections">{tabs.map(([value,label]) => <button key={value} aria-current={active === value ? 'page' : undefined} onClick={() => showTab(value)}>{label}</button>)}</nav>}
        <main className={`account-content${pending ? ' account-content--setup' : ''}`}>
          {!pending && active!=='projects' && <BackRow onClick={goBack}>{fromEditor ? 'Back to editor' : previousTab ? `Back to ${previousTab.charAt(0).toUpperCase() + previousTab.slice(1)}` : 'Back to projects'}</BackRow>}
          <Notice error>{error}</Notice><Notice>{message || auth.accountNotice}</Notice>
          {pending ? <><div className="account-page-heading"><SetupProgress step={2} /><div className="account-eyebrow">FINISH YOUR ACCOUNT</div><h1>One last step to get started.</h1><p>Connect an authenticator to protect your owner account.</p></div><>{preparing ? <section className="account-panel" role="status">Preparing your authenticator…</section> : <AuthenticatorSetup key={initialSetup ? 'prepared' : 'manual'} initialSetup={initialSetup} onComplete={text=>{setInitialSetup(null);setMessage(text)}} />}</></>
            : active === 'projects' ? <Projects onShare={share} />
            : active === 'sharing' ? <ProjectAccess id={projectId} />
            : active === 'security' ? <AccountSecurity onComplete={setMessage} />
            : active === 'about' ? <AboutAtria signedIn />
            : owner ? <OwnerWorkspace key={active} tab={active} onNavigate={showTab} /> : null}
        </main>
      </>}
    <footer className="account-footer"><span>Atria Studio <span>Hosted on your server</span></span><a href="/account?tab=about">About Atria 3DVR</a></footer>
  </div>
}

function SetupProgress({step}) {
  return <ol className="account-setup-progress" aria-label="Server setup progress">{['Create password','Connect authenticator','Ready'].map((label,index)=><li key={label} aria-current={index+1===step ? 'step' : undefined}><span>{index+1<step ? '✓' : index+1}</span>{label}</li>)}</ol>
}
function ServerSetup({state,onActivate}) {
  const [value,setValue]=useState(''), [error,setError]=useState('')
  function submit(event){event.preventDefault();const token=activationToken(value);if(!token)return setError('Paste the activation link or code printed in your server terminal.');onActivate(token)}
  const command='npm run accounts -- init owner@example.com --https'
  return <div className="account-form"><div className="account-eyebrow">WELCOME TO YOUR SERVER</div><h1>Let’s get you set up.</h1><p className="account-intro">Create the owner account, connect an authenticator, and you’re ready. You can finish everything here.</p><SetupProgress step={1} />{state==='needs-initialization' && <div className="account-instruction"><p>First, run this command in the terminal on your server:</p><code className="account-command">{command}</code><p>Use your preferred account email. It is only a sign-in identifier.</p><CopyButton value={command} label="Copy command" /></div>}<form className="account-form" onSubmit={submit}><Notice error>{error}</Notice><label className="account-field">Activation link or code<input autoFocus required value={value} onChange={event=>setValue(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Paste the link from your server terminal" /></label><p className="account-help">Paste it here to continue on this device. The link proves you have access to the server.</p><button className="account-primary account-submit">Continue setup</button></form>{state!=='needs-initialization' && <details><summary>Need a fresh activation link?</summary><p className="account-help">Run this in the server terminal. Your existing projects and files are preserved.</p><code className="account-command">{command}</code><CopyButton value={command} label="Copy command" /></details>}</div>
}
function Activation({token,onComplete}) {
  const [name,setName]=useState(''), [password,setPassword]=useState(''), [error,setError]=useState(''), [busy,setBusy]=useState(false)
  async function submit(event) {
    event.preventDefault();setBusy(true);setError('')
    try {const result=await accountRequest('/api/accounts/accept',{token,name:name.trim(),password});setPassword('');await onComplete(result.signedIn,password)}
    catch(failure){setError(failure.message)}finally{setBusy(false)}
  }
  return <form className="account-form" onSubmit={submit} aria-busy={busy}><div className="account-eyebrow">SET YOUR SIGN-IN DETAILS</div><h1>Make yourself at home.</h1><p className="account-intro">Set your name and password to activate your account or complete a password reset.</p><Notice error>{error}</Notice><label className="account-field">Your name<input autoFocus required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="How should we call you?" /></label><PasswordField id="activation-password" label="Choose a password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" minLength={15} /><p className="account-help">Use at least 15 characters. A short sentence works well.</p><button className="account-primary account-submit" disabled={busy}>{busy ? 'Saving…' : 'Set password and continue'}</button><p className="account-help">No email verification is needed. Your account email is your sign-in identifier.</p></form>
}

function Projects({onShare}) {
  const [projects,setProjects]=useState([]), [loading,setLoading]=useState(true), [error,setError]=useState(''), [title,setTitle]=useState(''), [mode,setMode]=useState(''), [busy,setBusy]=useState(false)
  const [author,setAuthor]=useState(''), [description,setDescription]=useState('')
  const [query,setQuery]=useState(''), [status,setStatus]=useState('all'), [sort,setSort]=useState('updated')
  useEffect(()=>{let alive=true;accountRequest('/api/projects').then(data=>{if(alive)setProjects(data)}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[])
  async function create(event){event.preventDefault();if(!title.trim() || busy)return;setBusy(true);setError('');try{const project=await accountRequest('/api/projects',{title:title.trim(),metadata:{author:author.trim(),description:description.trim()}});location.href='/editor/'+encodeURIComponent(project.id)}catch(e){setError(e.message);setBusy(false)}}
  async function refresh(){setLoading(true);setError('');try{setProjects(await accountRequest('/api/projects'))}catch(e){setError(e.message)}finally{setLoading(false)}}
  const visible=projects.filter(p=>(status==='all' || (status==='published' ? p.isPublished : !p.isPublished)) && [p.title,p.author,p.description].join(' ').toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>sort==='name' ? (a.title || '').localeCompare(b.title || '') : String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  return <><div className="account-page-heading account-row"><div><h1>Your projects</h1><p>Create, edit and share your visitor experiences.</p></div><div className="account-actions"><button aria-expanded={mode==='import'} disabled={busy} onClick={()=>setMode(mode==='import' ? '' : 'import')}>{mode==='import' ? 'Close import' : 'Import project'}</button><button className="account-primary" aria-expanded={mode==='create'} disabled={busy} onClick={()=>setMode(mode==='create' ? '' : 'create')}>{mode==='create' ? 'Close form' : '+ New project'}</button></div></div><Notice error>{error}</Notice>
    {mode==='create' && <section className="account-panel"><PanelHeading title="Start a new project" description="Choose a name and optional credits. You can update these in Project details later." /><form className="account-form account-form--compact" onSubmit={create}><label className="account-field">Project name<input autoFocus required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Autumn exhibition" /></label><label className="account-field"><span>Author <span className="account-optional">(optional)</span></span><input maxLength={PROJECT_METADATA_LIMITS.author} value={author} onChange={e=>setAuthor(e.target.value)} placeholder="Person or team behind the tour" /></label><label className="account-field"><span>Description <span className="account-optional">(optional)</span></span><textarea rows={3} maxLength={PROJECT_METADATA_LIMITS.description} value={description} onChange={e=>setDescription(e.target.value)} placeholder="What will visitors experience?" /></label><p className="account-help">New projects are private until you choose to share them.</p><button className="account-primary" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create project'}</button></form></section>}
    {mode==='import' && <ProjectImport onImported={refresh} onBusyChange={setBusy} />}
    <section className="account-panel"><PanelHeading title="Project library" description={loading ? 'Loading your projects…' : `${projects.length} ${projects.length===1 ? 'project' : 'projects'} in your workspace`} />
      {error && <button onClick={refresh} disabled={loading}>Retry loading projects</button>}
      {projects.length>0 && <div className="account-project-filters"><label className="account-field">Search projects<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, author or description" /></label><label className="account-field">Status<Select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All projects</option><option value="draft">Drafts</option><option value="published">Published</option></Select></label><label className="account-field">Sort by<Select value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">Recently updated</option><option value="name">Name</option></Select></label></div>}
      {!loading && !error && !projects.length ? <div className="account-empty"><span className="account-empty-symbol" aria-hidden="true">◇</span><h3>A new perspective starts here.</h3><p>Create your first tour, then add scenes in the editor.</p></div> : <div className="account-project-list">{visible.map(p=><article className="account-project" key={p.id}><div><span className="account-badge">{p.isPublished ? 'Published' : 'Draft'}</span><h3>{p.title}</h3>{p.description && <p>{p.description}</p>}<span className="account-help">{p.author && `${p.author} · `}{p.sceneCount || 0} scenes · {p.guideCount || 0} guides</span></div><div className="account-actions"><a className="account-button account-primary" href={'/editor/'+encodeURIComponent(p.id)}>Open editor</a>{p.isPublished && <a className="account-button" href={'/v/'+encodeURIComponent(p.id)}>View tour</a>}{p.permission==='owner' && <button onClick={()=>onShare(p.id)}>Manage access</button>}</div></article>)}{!loading && projects.length>0 && !visible.length && <div className="account-empty"><p>No projects match these filters.</p><button onClick={()=>{setQuery('');setStatus('all')}}>Clear filters</button></div>}</div>}
    </section></>
}

function ProjectAccess({id}) {
  const auth=useAuth()
  const [access,setAccess]=useState(null), [visibility,setVisibility]=useState('private'), [email,setEmail]=useState(''), [error,setError]=useState(''), [message,setMessage]=useState(''), [busy,setBusy]=useState(false)
  const endpoint='/api/projects/'+encodeURIComponent(id)+'/access'
  useEffect(()=>{let alive=true;setAccess(null);accountRequest(endpoint).then(data=>{if(alive){setAccess(data);setVisibility(data.visibility)}}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[endpoint])
  async function save(next){setBusy(true);setError('');setMessage('');try{const result=await accountRequest(endpoint,next,'PUT');if(result.retainsAccess===false){location.href='/';return}const data=await accountRequest(endpoint);setAccess(data);setVisibility(data.visibility);setEmail('');setMessage('Project access updated.')}catch(e){setError(e.status===400 ? 'Keep at least one owner and use an existing account email from this server.' : e.message)}finally{setBusy(false)}}
  const url=location.origin+'/v/'+encodeURIComponent(id)
  return <><div className="account-page-heading"><h1>Project access</h1><p>Everyone with project access is an equal owner.</p></div><Notice error>{error}</Notice><Notice>{message}</Notice>{access && <>
    <section className="account-panel"><PanelHeading title="Tour visibility" description="This setting applies to the published tour. Drafts stay restricted to project owners." /><form onSubmit={e=>{e.preventDefault();save({...access,visibility})}}><fieldset className="account-choices"><legend className="account-sr-only">Visibility</legend>{[['private','Private','Only project owners can open the tour.'],['public','Public','Anyone with the tour link can view it.']].map(([value,label,description])=><label className="account-choice" key={value}><input type="radio" name="visibility" value={value} checked={visibility===value} onChange={()=>setVisibility(value)} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</fieldset><p className="account-help">Changing visibility cannot recall copies that were already saved.</p><button className="account-primary" disabled={busy || visibility===access.visibility}>{busy ? 'Saving…' : 'Save visibility'}</button></form></section>
    <section className="account-panel"><PanelHeading title="Project owners" description="Every owner can edit, publish and manage access." /><form className="account-inline-form" onSubmit={e=>{e.preventDefault();save({...access,owners:[...access.owners,{email:email.trim()}]})}}><label className="account-field">Account email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="colleague@example.com" /></label><button className="account-primary" disabled={busy}>Add owner</button></form><div className="account-member-list">{access.owners.map(owner=><div className="account-member" key={owner.user}><div><strong>{owner.name || owner.email}{owner.user===auth.user.id ? ' (you)' : ''}</strong><span className="account-help">{owner.email} · Owner</span></div><button disabled={busy || access.owners.length===1} onClick={()=>save({...access,owners:access.owners.filter(item=>item.user!==owner.user)})}>{owner.user===auth.user.id ? 'Leave project' : 'Remove'}</button></div>)}</div><p className="account-help">A project must keep at least one owner. Deleting an account keeps the project available to its other owners.</p></section>
    <section className="account-panel"><PanelHeading title="Tour link" description="Private tours will ask visitors to sign in." /><div className="account-copy-row"><input readOnly aria-label="Tour link" value={url} onFocus={e=>e.target.select()} /><CopyButton value={url} label="Copy link" /><a className="account-button" href={url}>Open tour</a></div></section>
  </>}</>
}

function OwnerWorkspace({tab,onNavigate}) {
  const [data,setData]=useState(null), [email,setEmail]=useState(''), [link,setLink]=useState(''), [error,setError]=useState(''), [message,setMessage]=useState(''), [busy,setBusy]=useState(false)
  const [temporary,setTemporary]=useState(null),[deleting,setDeleting]=useState(null)
  async function load(){setData(await accountRequest('/api/accounts/owner'))}
  useEffect(()=>{let alive=true;accountRequest('/api/accounts/owner').then(d=>{if(alive)setData(d)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[])
  async function run(work){setBusy(true);setError('');setMessage('');try{await work()}catch(e){setError(e.message)}finally{setBusy(false)}}
  async function invite(){const result=await accountRequest('/api/accounts/owner/invitations',{email:email.trim()});setTemporary(null);setLink(new URL(result.url,location.origin).href);setMessage(`Invitation ready for ${email}.`)}
  async function reset(user){const result=await accountRequest('/api/accounts/owner/users/'+encodeURIComponent(user.id)+'/reset-password',{});setLink('');setTemporary({email:user.email,password:result.temporaryPassword,mfa:user.twoFactorEnabled});await load();setMessage('Temporary password generated. Share it privately with the account holder.')}
  async function refreshServer(){setBusy(true);setError('');setMessage('');try{await load();setMessage('Server status refreshed.')}catch(e){setError(e.message)}finally{setBusy(false)}}

  return <><div className="account-page-heading"><h1>{tab==='server' ? 'Server console' : 'People & access'}</h1><p>{tab==='server' ? 'Monitor this self-hosted installation and jump to the controls that manage it.' : 'Invite people to create tours on this installation.'}</p></div><Notice error>{error}</Notice><Notice>{message}</Notice>{!data && !error && <p role="status">Loading…</p>}
    {temporary && <section className="account-panel account-panel--highlight"><PanelHeading title={'Temporary password for '+temporary.email} description="This password is shown only here. The user must choose a new password after signing in; that requirement does not expire." /><div className="account-copy-row"><input readOnly aria-label="Temporary password" autoComplete="off" value={temporary.password} /><CopyButton value={temporary.password} label="Copy password" /><button onClick={()=>setTemporary(null)}>Dismiss</button></div>{Boolean(temporary.mfa) && <p className="account-help">Their existing authenticator is still required at sign-in.</p>}</section>}
    {link && <section className="account-panel account-panel--highlight"><PanelHeading title="Your secure link is ready" description="Share it privately. It works once and expires in one hour; no email is sent." /><div className="account-copy-row"><input readOnly aria-label="Invitation or reset link" value={link} onFocus={e=>e.target.select()} /><CopyButton value={link} label="Copy link" /><button onClick={()=>setLink('')}>Dismiss</button></div></section>}
    {data && (tab==='server' ? <ServerConsole data={data} onRefresh={refreshServer} onNavigate={onNavigate} refreshing={busy} /> : <>
      <section className="account-panel"><PanelHeading title="Invite someone" description="They choose their own password using the link you share." /><form className="account-inline-form" onSubmit={e=>{e.preventDefault();run(()=>invite())}}><label className="account-field">Account email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="colleague@example.com" /></label><button className="account-primary" disabled={busy}>{busy ? 'Working…' : 'Create invitation'}</button></form></section>
      <section className="account-panel"><PanelHeading title="Accounts" description={`${data.users.length} accounts on this server. Suspending an account blocks sign-in and keeps its projects. Device details are private to each person.`} /><div className="account-member-list">{data.users.map(u=><div className="account-member" key={u.id}><span className="account-avatar" aria-hidden="true">{(u.name || u.email).slice(0,1).toUpperCase()}</span><div className="account-member-identity"><strong>{u.name || u.email}</strong><span className="account-help">{u.email}</span></div><span className="account-badge">{u.role==='owner' ? 'Owner' : u.banned ? 'Suspended' : 'Member'}</span>{Boolean(u.mustChangePassword) && <span className="account-badge">Password change required</span>}{Boolean(u.deleteAfter) && <span className="account-badge">Deletion: {new Date(u.deleteAfter).toLocaleDateString()}</span>}{u.role!=='owner' && <div className="account-actions"><button disabled={busy} onClick={()=>run(()=>reset(u))}>Reset password</button><button disabled={busy} onClick={()=>run(async()=>{await accountRequest('/api/accounts/owner/users/'+u.id,{suspended:!u.banned});await load();setMessage(u.banned ? 'Account reactivated.' : 'Account suspended.')})}>{u.banned ? 'Reactivate' : 'Suspend'}</button><button className="account-danger" disabled={busy || u.deletionPending} onClick={()=>setDeleting(u)}>Delete account</button></div>}</div>)}</div></section>
    </>)}
    {deleting && <AccountDeletionDialog user={deleting} self={false} onClose={()=>setDeleting(null)} onDeleted={async result=>{setDeleting(null);await load();setMessage('Account deletion scheduled for '+new Date(result.deleteAfter).toLocaleString()+'. Signing in before then cancels deletion.')}} />}
  </>
}

function AccountSecurity({onComplete}) {
  const auth=useAuth(), [current,setCurrent]=useState(''), [password,setPassword]=useState(''), [message,setMessage]=useState(''), [error,setError]=useState(''), [busy,setBusy]=useState(false)
  const [deleting,setDeleting]=useState(false),[deviceVersion,setDeviceVersion]=useState(0)
  async function run(work,notice){setBusy(true);setError('');setMessage('');try{await work();setMessage(notice)}catch(e){setError(e.message)}finally{setBusy(false)}}
  return <><div className="account-page-heading"><h1>Account security</h1><p>Manage your sign-in details and connected devices.</p></div><Notice error>{error}</Notice><Notice>{message}</Notice><section className="account-panel"><PanelHeading title="Your account" /><dl className="account-profile"><div><dt>Name</dt><dd>{auth.user.name}</dd></div><div><dt>Sign-in email</dt><dd>{auth.user.email}</dd></div><div><dt>Authenticator</dt><dd><span className="account-badge">{auth.user.twoFactorEnabled ? 'Connected' : 'Not connected'}</span></dd></div></dl></section>
    <AvatarSettings onMessage={setMessage} />
    {!auth.user.twoFactorEnabled && <details className="account-panel"><summary>Add an authenticator (optional)</summary><AuthenticatorSetup onComplete={onComplete} /></details>}
    <section className="account-panel"><PanelHeading title="Change password" description="Other devices will be signed out after your password changes." /><form className="account-form account-form--compact" onSubmit={e=>{e.preventDefault();run(async()=>{await accountRequest('/api/auth/change-password',{currentPassword:current,newPassword:password,revokeOtherSessions:true});setCurrent('');setPassword('');setDeviceVersion(value=>value+1)},'Password changed. Other devices have been signed out.')}}><PasswordField id="current-password" label="Current password" value={current} onChange={e=>setCurrent(e.target.value)} /><PasswordField id="new-password" label="New password" autoComplete="new-password" minLength={15} value={password} onChange={e=>setPassword(e.target.value)} /><p className="account-help">Use at least 15 characters.</p><button className="account-primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button></form></section>
    <DeviceSessions key={deviceVersion} />
    {auth.user.role==='user' && <section className="account-panel account-panel--danger"><PanelHeading title="Delete your account" description="Export your projects first. The server keeps your data for 30 days, and signing in during that time cancels deletion." /><button className="account-danger" onClick={()=>setDeleting(true)}>Delete my account</button></section>}
    {deleting && <AccountDeletionDialog user={auth.user} self onClose={()=>setDeleting(false)} onDeleted={async result=>{setDeleting(false);onComplete('Deletion is scheduled for '+new Date(result.deleteAfter).toLocaleString()+'. Sign in before that date to cancel it.');await auth.logout()}} />}

  </>
}