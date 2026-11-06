import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import express from 'express'

test('cookie accounts enforce invitations, owner MFA, revocation, project and media boundaries', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'atria-security-'))
  process.env.VR_STORAGE_ROOT=root
  process.env.VR_SECURITY_ROOT=':memory:'
  process.env.AUTH_SECRET_FILE=path.join(root,'secret')
  await fs.writeFile(process.env.AUTH_SECRET_FILE,crypto.randomBytes(48).toString('hex'))
  const app = express(), server = app.listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true})})
  const base=`http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGIN=base
  const {getAuth,securityDb,invitation}=await import('../server/identity.js')
  const {identity}=await import('../server/auth.js')
  const {authHandler,createAccountsRouter,sameOrigin}=await import('../server/accounts.js')
  const {resourceLimits}=await import('../server/resourceLimits.js')
  const {accessGate}=await import('../server/access.js')
  const {createProjectsRouter}=await import('../server/projects.js')
  const {createAssetsRouter}=await import('../server/assets.js')
  const {saveProjectDraft,publishProject}=await import('../server/projectStore.js')
  const auth=getAuth();await (await auth.$context).runMigrations()
  app.use((req,_res,next)=>{req.headers['x-atria-client-ip']=req.get('X-Test-IP') || req.socket.remoteAddress;next()});app.use(sameOrigin);app.use('/api/auth',authHandler());app.use(express.json());app.use(identity)
  app.use('/api/accounts',createAccountsRouter(express));app.use(accessGate);app.use(resourceLimits);app.use('/api/projects',createProjectsRouter(express))
  app.use('/api/assets',createAssetsRouter(express))
  app.post('/api/upload',(_req,res)=>res.json({ok:true}))
  app.get('/uploads/:name',(_req,res)=>res.send('private media'))
  const request=async(url,body,cookie,method)=> {
    const r=await fetch(base+url,{method:method || (body ? 'POST':'GET'),headers:{Origin:base,'X-Test-IP':body?.email?.startsWith('owner') ? '127.0.0.2' : body?.email?.startsWith('other') ? '127.0.0.3' : '127.0.0.1',...(body ? {'Content-Type':'application/json'}:{}),...(cookie ? {Cookie:cookie}:{})},...(body ? {body:JSON.stringify(body)}:{})})
    return {status:r.status,data:await r.json().catch(()=>null),cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')}
  }
  const password='correct horse battery staple!'
  assert.equal((await request('/api/auth/sign-up/email',{email:'rogue@example.test',name:'Rogue',password})).status,404)
  for(const role of ['owner','user']) {
    const token=invitation(role+'@example.test',role)
    assert.equal((await request('/api/accounts/accept',{token,name:role,password})).status,200)
    assert.equal((await request('/api/accounts/accept',{token,name:role,password})).status,400)
  }
  const regular=await request('/api/auth/sign-in/email',{email:'user@example.test',password})
  assert.equal(regular.status,200);assert.ok(regular.cookie)
  assert.equal((await request('/api/accounts/owner',null,regular.cookie)).status,403)
  const owner=await request('/api/auth/sign-in/email',{email:'owner@example.test',password})
  assert.equal((await request('/api/accounts/owner',null,owner.cookie)).status,403)
  assert.equal((await request('/api/projects',{title:'Not ready'},owner.cookie)).status,403,'owner must finish MFA before authoring')
  assert.equal((await request('/api/auth/admin/create-user',{email:'evil@example.test',password,name:'evil',role:'owner'},regular.cookie)).status,404)
  assert.equal((await request('/api/auth/two-factor/disable',{password},owner.cookie)).status,403)
  const setup=await request('/api/auth/two-factor/enable',{password},owner.cookie)
  assert.equal(setup.status,200)
  const {createOTP}=await import('@better-auth/utils/otp')
  const {base32}=await import('@better-auth/utils/base32')
  const secret=new URL(setup.data.totpURI).searchParams.get('secret')
  const code=await createOTP(base32.decode(secret)).totp()
  const enrolled=await request('/api/auth/two-factor/verify-totp',{code},owner.cookie)
  assert.equal(enrolled.status,200)
  assert.equal(securityDb().prepare("SELECT COUNT(*) AS count FROM session WHERE userId=(SELECT id FROM user WHERE role='owner')").get().count,1,'all earlier owner setup sessions are revoked')
  assert.equal((await request('/api/accounts/owner',null,enrolled.cookie)).status,200,'verified enrollment session enters owner controls directly')
  assert.equal((await request('/api/accounts/owner/invitations',{email:'onboarding@example.test'},enrolled.cookie)).status,200,'verified owner can manage users immediately')
  assert.equal((await request('/api/accounts/owner',null,owner.cookie)).status,403)
  const challenge=await request('/api/auth/sign-in/email',{email:'owner@example.test',password})
  assert.equal(challenge.data.twoFactorRedirect,true)
  assert.equal((await request('/api/accounts/owner',null,challenge.cookie)).status,403)
  const verified=await request('/api/auth/two-factor/verify-backup-code',{code:setup.data.backupCodes[0],trustDevice:true},challenge.cookie)
  assert.equal(verified.status,200)
  assert.equal((await request('/api/accounts/owner',null,verified.cookie)).status,200)
  const ownerSession=await auth.api.getSession({headers:new Headers({Cookie:verified.cookie})})
  const context=await auth.$context
  const trustCookie=verified.cookie.split('; ').find(cookie=>cookie.startsWith('better-auth.trust_device='))
  assert.ok(trustCookie,'successful MFA issues a signed device cookie')
  const trust=securityDb().prepare("SELECT * FROM verification WHERE identifier LIKE 'trust-device-%'").get()
  assert.ok(Math.abs(new Date(trust.expiresAt).getTime()-Date.now()-7200000)<10000,'MFA grace lasts two hours')
  const withinGrace=await request('/api/auth/sign-in/email',{email:'owner@example.test',password},trustCookie)
  assert.equal(withinGrace.status,200)
  assert.notEqual(withinGrace.data.twoFactorRedirect,true,'same browser does not need another MFA code during grace')
  const rotatedTrust=securityDb().prepare("SELECT * FROM verification WHERE identifier LIKE 'trust-device-%'").get()
  assert.equal(new Date(rotatedTrust.expiresAt).getTime(),new Date(trust.expiresAt).getTime(),'signing in rotates the cookie without extending grace')
  await context.adapter.update({model:'verification',where:[{field:'id',value:rotatedTrust.id}],update:{expiresAt:new Date(Date.now()-1000)}})
  // Exercise grace expiry independently of the separate sign-in rate limiter.
  securityDb().prepare('DELETE FROM rateLimit').run()
  const afterGrace=await request('/api/auth/sign-in/email',{email:'owner@example.test',password},withinGrace.cookie)
  assert.equal(afterGrace.status,200,JSON.stringify(afterGrace.data))
  assert.equal(afterGrace.data.twoFactorRedirect,true,'expired grace requires MFA again')
  await context.adapter.update({model:'session',where:[{field:'id',value:ownerSession.session.id}],update:{createdAt:new Date(Date.now()-3600000)}})
  assert.equal((await request('/api/accounts/owner/invitations',{email:'after-an-hour@example.test'},verified.cookie)).status,200,'an active owner session can invite people after five minutes without signing in again')
  await auth.api.createUser({body:{email:'reset-subject@example.test',name:'Reset subject',password,role:'user'}})
  assert.equal((await request('/api/accounts/owner/invitations',{email:'reset-subject@example.test',reset:true},verified.cookie)).status,200,'temporary password resets use the same active owner session')
  assert.equal((await request('/api/auth/list-sessions',null,verified.cookie)).status,200,'the authentication library also accepts an older active session')
  assert.equal((await request('/api/auth/two-factor/disable',{password},verified.cookie)).status,403)
  const ownProject=await request('/api/projects',{title:'Owner’s tour'},verified.cookie)
  assert.equal(ownProject.status,201,'owner can create projects with the same login')
  assert.equal((await request('/api/projects/'+ownProject.data.id+'/draft',null,verified.cookie)).status,200)
  assert.equal((await request('/api/projects/'+ownProject.data.id+'/draft',null,regular.cookie)).status,403,'owner project remains private')
  const ownerProjects=await request('/api/projects',null,verified.cookie)
  assert.ok(ownerProjects.data.some(project=>project.id===ownProject.data.id))
  const created=await request('/api/projects',{title:'Private exhibition'},regular.cookie)
  assert.equal(created.status,201)
  const id=created.data.id
  assert.equal((await request('/api/projects/'+id+'/draft')).status,401)
  assert.equal((await request('/api/projects/'+id+'/draft',null,regular.cookie)).status,200)
  assert.equal((await request('/api/projects/'+id+'/draft',null,verified.cookie)).status,403)
  await auth.api.createUser({body:{email:'other@example.test',name:'Other',password,role:'user'}})
  const other=await request('/api/auth/sign-in/email',{email:'other@example.test',password})
  assert.equal(other.status,200,JSON.stringify(other.data))
  assert.equal((await request('/api/projects/'+id+'/draft',null,other.cookie)).status,403)
  assert.deepEqual((await request('/api/projects',null,other.cookie)).data,[])
  assert.equal((await request('/api/projects/'+id+'/access',{visibility:'public',members:[]},other.cookie,'PUT')).status,403)
  assert.equal((await request('/api/projects/'+id+'/access',{visibility:'private',members:[{email:'other@example.test',permission:'view'}]},regular.cookie,'PUT')).status,200)
  assert.equal((await request('/api/projects/'+id+'/draft',null,other.cookie)).status,200,'legacy project access now grants equal ownership')
  assert.equal((await request('/api/projects/'+id+'/draft',created.data,other.cookie,'PUT')).status,200,'every project owner can save the draft')
  const ownership=(await request('/api/projects/'+id+'/access',null,other.cookie)).data
  assert.equal(ownership.owners.length,2)
  assert.equal((await request('/api/projects/'+id+'/access',{visibility:'private',owners:ownership.owners},other.cookie,'PUT')).status,200,'an added owner can manage access just like the creator')
  assert.equal((await request('/api/projects/'+id+'/access',{visibility:'private',owners:[]},other.cookie,'PUT')).status,400,'a project cannot be left without an owner')
  assert.equal((await request('/uploads/secret.jpg')).status,401)
  const user=securityDb().prepare('SELECT id FROM user WHERE email=?').get('user@example.test')
  securityDb().prepare("INSERT INTO resources(kind,id,owner) VALUES('asset','/uploads/secret.jpg',?)").run(user.id)
  await fs.mkdir(path.join(root,'public/uploads'),{recursive:true})
  await fs.writeFile(path.join(root,'public/uploads/private.glb'),'private model')
  securityDb().prepare("INSERT INTO resources(kind,id,owner) VALUES('asset','/uploads/private.glb',?)").run(user.id)
  const thumbnail='/api/assets/thumbnail?url='+encodeURIComponent('/uploads/private.glb')
  const capture='/api/assets/model-thumbnail?url='+encodeURIComponent('/uploads/private.glb')
  assert.equal((await request(thumbnail)).status,401,'anonymous requests cannot inspect thumbnail existence')
  assert.equal((await request(thumbnail,null,other.cookie)).status,403,'other accounts cannot read model thumbnails')
  assert.equal((await request(capture,{},other.cookie)).status,403,'other accounts cannot replace model thumbnails')
  assert.equal((await request(capture,{},regular.cookie)).status,409,'owned model captures must match the current source version')
  assert.equal((await request(thumbnail,null,regular.cookie)).status,404,'an authorized uncached model has no thumbnail yet')
  assert.equal((await request('/uploads/secret.jpg',null,regular.cookie)).status,200)
  assert.equal((await request('/uploads/secret.jpg',null,other.cookie)).status,403)
  const draft=await saveProjectDraft(id,{...created.data,scenes:[{...created.data.scenes[0],image:'/uploads/secret.jpg'}]})
  await publishProject(id)
  assert.equal((await request('/api/projects/'+id+'/manifest')).status,401)
  assert.equal((await request('/api/projects/'+id+'/manifest',null,other.cookie)).data.offlineAccount,securityDb().prepare('SELECT id FROM user WHERE email=?').get('other@example.test').id)
  assert.equal((await request('/api/projects/'+id+'/access',{visibility:'public',members:[]},regular.cookie,'PUT')).status,200)
  assert.equal((await request('/api/projects/'+id+'/manifest')).status,200)
  assert.equal((await request('/uploads/secret.jpg')).status,200)
  assert.equal((await request('/api/projects/'+id+'/draft')).status,401)
  const oldQuota=process.env.USER_STORAGE_QUOTA_BYTES
  process.env.USER_STORAGE_QUOTA_BYTES='1'
  assert.equal((await request('/api/upload',{payload:'too big'},regular.cookie)).status,413)
  if(oldQuota) process.env.USER_STORAGE_QUOTA_BYTES=oldQuota; else delete process.env.USER_STORAGE_QUOTA_BYTES
  const forged=await fetch(base+'/api/projects',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json',Cookie:regular.cookie},body:'{}'})
  assert.equal(forged.status,403)
  const otherId=securityDb().prepare('SELECT id FROM user WHERE email=?').get('other@example.test').id
  const equalProject=await request('/api/projects',{title:'Equal owners'},regular.cookie),equalId=equalProject.data.id
  assert.equal((await request('/api/projects/'+equalId+'/access',{visibility:'private',owners:[{user:user.id},{user:otherId}]},regular.cookie,'PUT')).status,200)
  const removal=await request('/api/projects/'+equalId+'/access',{visibility:'private',owners:[{user:otherId}]},other.cookie,'PUT')
  assert.equal(removal.status,200,'any project owner can remove the creator without a superior role')
  assert.equal((await request('/api/projects/'+equalId+'/draft',null,regular.cookie)).status,403)
  assert.equal((await request('/api/projects/'+equalId+'/draft',null,other.cookie)).status,200)
  assert.equal((await request('/api/accounts/owner/users/'+otherId,{suspended:true},verified.cookie)).status,200)
  assert.equal((await request('/api/projects',null,other.cookie)).status,401)
  await request('/api/auth/sign-out',{},regular.cookie)
  assert.equal((await request('/api/projects',null,regular.cookie)).status,401)
  await context.adapter.update({model:'session',where:[{field:'id',value:ownerSession.session.id}],update:{expiresAt:new Date(Date.now()-1000)}})
  assert.equal((await request('/api/accounts/owner/invitations',{email:'expired-session@example.test'},verified.cookie)).status,403,'an expired owner session cannot invite people')
  const ownerId=securityDb().prepare("SELECT id FROM user WHERE role='owner'").get().id
  securityDb().prepare('DELETE FROM session WHERE userId=?').run(ownerId)
  securityDb().prepare('DELETE FROM twoFactor WHERE userId=?').run(ownerId)
  securityDb().prepare('UPDATE user SET banned=1,twoFactorEnabled=0 WHERE id=?').run(ownerId)
  const recoverToken=invitation('owner@example.test','owner-recovery',15)
  const recovered=await request('/api/accounts/accept',{token:recoverToken,name:'Owner',password:'New recovery password for tests!'})
  assert.equal(recovered.status,200)
  assert.equal(recovered.data.signedIn,true)
  assert.equal((await request('/api/accounts/me',null,recovered.cookie)).data.user.id,ownerId)
  assert.equal(securityDb().prepare('SELECT owner FROM grants WHERE project=?').get(ownProject.data.id).owner,ownerId,'credential recovery preserves project ownership')
  assert.equal((await request('/api/projects',null,recovered.cookie)).status,403,'recovered owner must enroll MFA again')
})

test('local setup creates private secrets and migration preserves legacy source files', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'atria-setup-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const cwd=path.join(root,'checkout'),storage=path.join(root,'runtime')
  await fs.mkdir(path.join(cwd,'server/data'),{recursive:true})
  await fs.mkdir(path.join(cwd,'public/uploads'),{recursive:true})
  await fs.mkdir(path.join(cwd,'public/demo'),{recursive:true})
  await fs.writeFile(path.join(cwd,'server/data/scenes.json'),'[]')
  await fs.writeFile(path.join(cwd,'public/uploads/example.jpg'),'original bytes')
  const env={...process.env,NODE_ENV:'development',VR_STORAGE_ROOT:storage,VR_SECURITY_ROOT:path.join(storage,'security'),AUTH_SECRET_FILE:path.join(storage,'security/auth.secret'),APP_ORIGIN:'http://localhost:5173'}
  const script=fileURLToPath(new URL('../scripts/accounts.mjs',import.meta.url))
  const run=args=>spawnSync(process.execPath,[script,...args],{cwd,env,encoding:'utf8'})
  const init=run(['init','owner@example.test'])
  assert.equal(init.status,0,init.stderr)
  assert.match(init.stdout,/http:\/\/localhost:5173\/account#invite=[a-f0-9]{64}/)
  assert.ok((await fs.readFile(env.AUTH_SECRET_FILE,'utf8')).length>=43)
  const copied=run(['migrate-data'])
  assert.equal(copied.status,0,copied.stderr)
  assert.equal(await fs.readFile(path.join(storage,'public/uploads/example.jpg'),'utf8'),'original bytes')
  assert.equal(await fs.readFile(path.join(cwd,'public/uploads/example.jpg'),'utf8'),'original bytes')
  assert.notEqual(run(['migrate-data']).status,0,'migration refuses accidental overwrites')
  const identityUrl=new URL('../server/identity.js',import.meta.url).href
  const createCode=`const {getAuth,securityDb}=await import(${JSON.stringify(identityUrl)});const result=await getAuth().api.createUser({body:{email:'owner@example.test',name:'Owner',role:'owner',password:'Temporary test account password!'}});securityDb().prepare('INSERT INTO grants(project,owner) VALUES(?,?)').run('recovery-project',result.user.id);console.log(result.user.id)`
  const created=spawnSync(process.execPath,['--input-type=module','-e',createCode],{cwd,env,encoding:'utf8'})
  assert.equal(created.status,0,created.stderr)
  const ownerId=created.stdout.trim()
  const recovery=run(['recover','owner@example.test'])
  assert.equal(recovery.status,0,recovery.stderr)
  const inspectCode=`const {securityDb}=await import(${JSON.stringify(identityUrl)});const db=securityDb();console.log(JSON.stringify({user:db.prepare("SELECT id,banned FROM user WHERE role='owner'").get(),grant:db.prepare('SELECT owner FROM grants WHERE project=?').get('recovery-project')}))`
  const inspected=spawnSync(process.execPath,['--input-type=module','-e',inspectCode],{cwd,env,encoding:'utf8'})
  assert.equal(inspected.status,0,inspected.stderr)
  const after=JSON.parse(inspected.stdout)
  assert.equal(after.user.id,ownerId)
  assert.equal(after.grant.owner,ownerId)
  assert.equal(after.user.banned,1,'old credentials are blocked during local recovery')

})

test('owner controls use the active MFA session without a separate age limit', async () => {
  const { ownerOnly } = await import('../server/accounts.js')
  const identity={user:{role:'owner',twoFactorEnabled:true,banned:false},session:{createdAt:new Date(Date.now()-3600000)}}
  let continued=false, status
  const response={status(value){status=value;return this},json(){return this}}
  for (const method of ['GET','HEAD','POST','PUT','DELETE']) {
    continued=false
    ownerOnly({identity,method},response,()=>{continued=true})
    assert.equal(continued,true,`${method} accepts an active hour-old owner session`)
  }
  for (const denied of [null,{...identity,user:{...identity.user,role:'user'}},{...identity,user:{...identity.user,twoFactorEnabled:false}},{...identity,user:{...identity.user,banned:true}}]) {
    continued=false;status=undefined
    ownerOnly({identity:denied,method:'POST'},response,()=>{continued=true})
    assert.equal(continued,false)
    assert.equal(status,403)
  }
})
