import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import express from 'express'
import yauzl from 'yauzl'
import { containedPath } from '../server/accountFiles.js'
import { deviceName, approximateLocation } from '../server/deviceInfo.js'

function zipContents(bytes) {
  return new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true},(error,zip)=> {
    if(error)return reject(error)
    const entries=new Map()
    zip.on('error',reject);zip.on('end',()=>resolve(entries));zip.on('entry',entry=>zip.openReadStream(entry,(error,stream)=> {
      if(error)return reject(error)
      const chunks=[];stream.on('data',chunk=>chunks.push(chunk));stream.on('error',reject);stream.on('end',()=>{entries.set(entry.fileName,Buffer.concat(chunks));zip.readEntry()})
    }));zip.readEntry()
  }))
}

test('account file boundaries and local device descriptions',async()=> {
  const root=path.resolve('storage')
  assert.throws(()=>containedPath(root,'../secret'),/outside/)
  assert.throws(()=>containedPath(root,'.'),/outside/)
  assert.equal(await approximateLocation('192.168.1.20'),'Local network')
  assert.equal(await approximateLocation('100.92.248.121'),'Local network')
  assert.equal(await approximateLocation('8.8.8.8'),'United States')
  assert.equal(deviceName('Mozilla Windows NT 10.0 Chrome/125.0'),'Chrome on Windows')
})

test('temporary passwords, private devices, account exports and recoverable deletion are enforced by the server',async t=> {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'atria-account-management-'))
  process.env.VR_STORAGE_ROOT=root
  process.env.VR_SECURITY_ROOT=':memory:'
  process.env.AUTH_SECRET_FILE=path.join(root,'secret')
  await fs.writeFile(process.env.AUTH_SECRET_FILE,crypto.randomBytes(48).toString('hex'))
  const app=express(),server=app.listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.ok(root.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true})})
  const base=`http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGIN=base
  const {getAuth,securityDb}=await import('../server/identity.js')
  const {identity}=await import('../server/auth.js')
  const {authHandler,createAccountsRouter,sameOrigin}=await import('../server/accounts.js')
  const {accessGate}=await import('../server/access.js')
  const {createProjectsRouter}=await import('../server/projects.js')
  const {purgeDeletedAccounts}=await import('../server/accountLifecycle.js')
  const {listProjects,publishProject}=await import('../server/projectStore.js')
  const auth=getAuth(),context=await auth.$context;await context.runMigrations()
  const db=securityDb(),password='Original test account password!'
  app.use((req,_res,next)=>{req.headers['x-atria-client-ip']=req.get('X-Test-IP') || '127.0.0.1';next()})
  app.use(sameOrigin);app.use('/api/auth',authHandler());app.use(express.json());app.use(identity)
  app.use('/api/accounts',createAccountsRouter(express));app.use(accessGate);app.use('/api/projects',createProjectsRouter(express))
  app.use('/uploads',express.static(path.join(root,'public/uploads')))
  app.use((error,_req,res,_next)=>res.status(error.status || 500).json({error:error.message}))
  async function request(url,body,cookie,method,options={}) {
    const response=await fetch(base+url,{signal:AbortSignal.timeout(20000),method:method || (body?'POST':'GET'),headers:{Origin:base,'X-Test-IP':options.ip || '127.0.0.1','User-Agent':options.agent || 'Mozilla Windows NT 10.0 Chrome/125.0',...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})})
    const data=response.headers.get('content-type')?.includes('application/zip') ? Buffer.from(await response.arrayBuffer()) : await response.json().catch(()=>null)
    return {status:response.status,data,cookie:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')}
  }
  async function login(email,secret=password,options={}) {
    db.prepare('DELETE FROM rateLimit').run() // Each case tests account behavior, independently of the separate limiter.
    return request('/api/auth/sign-in/email',{email,password:secret},options.cookie,undefined,options)
  }
  const owner=(await auth.api.createUser({body:{email:'owner@management.test',name:'Owner',password,role:'owner'}})).user
  const member=(await auth.api.createUser({body:{email:'member@management.test',name:'Member',password,role:'user'}})).user
  const other=(await auth.api.createUser({body:{email:'other@management.test',name:'Other',password,role:'user'}})).user
  const ownerStart=await login(owner.email)
  const setup=await request('/api/auth/two-factor/enable',{password},ownerStart.cookie)
  const {createOTP}=await import('@better-auth/utils/otp'),{base32}=await import('@better-auth/utils/base32')
  const code=await createOTP(base32.decode(new URL(setup.data.totpURI).searchParams.get('secret'))).totp()
  const ownerVerified=await request('/api/auth/two-factor/verify-totp',{code},ownerStart.cookie)
  assert.equal(ownerVerified.status,200)
  const ownerCookie=ownerVerified.cookie
  const ownerSession=await auth.api.getSession({headers:new Headers({Cookie:ownerCookie})})
  await context.adapter.update({model:'session',where:[{field:'id',value:ownerSession.session.id}],update:{createdAt:new Date(Date.now()-3600000)}})

  const deviceA=await login(member.email,password,{ip:'8.8.8.8'}),deviceB=await login(member.email,password,{ip:'1.1.1.1',agent:'Mozilla Linux Firefox/125.0'})
  await request('/api/accounts/me',null,deviceA.cookie,undefined,{ip:'8.8.8.8'})
  await request('/api/accounts/me',null,deviceB.cookie,undefined,{ip:'1.1.1.1'})
  const devices=await request('/api/accounts/sessions',null,deviceA.cookie,undefined,{ip:'8.8.8.8'})
  assert.equal(devices.status,200)
  assert.equal(devices.data.length,2)
  assert.equal(devices.data.filter(device=>device.current).length,1)
  assert.ok(devices.data.some(device=>device.ip==='1.1.1.1'))
  assert.ok(devices.data.every(device=>!device.token && device.location && device.device))
  const foreign=devices.data.find(device=>!device.current)
  assert.equal((await request('/api/accounts/sessions/'+foreign.id,null,ownerCookie,'DELETE')).status,404,'the owner cannot revoke another person’s device session')
  assert.equal((await request('/api/accounts/owner/users/'+member.id,{},ownerCookie)).status,400,'legacy admin device revocation is disabled')
  const ownerDevices=await request('/api/accounts/sessions?userId='+member.id,null,ownerCookie)
  assert.ok(ownerDevices.data.every(device=>!devices.data.some(memberDevice=>memberDevice.id===device.id)),'query parameters cannot expose another account’s devices')
  assert.equal((await request('/api/accounts/sessions/'+foreign.id,null,deviceA.cookie,'DELETE')).status,200)
  assert.equal((await request('/api/projects',null,deviceB.cookie)).status,401)
  const anotherDevice=await login(member.email)
  const others=await request('/api/accounts/sessions/revoke',{scope:'others'},deviceA.cookie)
  assert.equal(others.data.currentSignedOut,false)
  assert.equal(others.data.count,1)
  assert.equal((await request('/api/projects',null,anotherDevice.cookie)).status,401)
  await login(member.email)
  const all=await request('/api/accounts/sessions/revoke',{scope:'all'},deviceA.cookie)
  assert.equal(all.data.currentSignedOut,true)
  assert.equal(all.data.count,2)
  assert.equal((await request('/api/projects',null,deviceA.cookie)).status,401)
  const beforeReset=await login(member.email)

  const reset=await request('/api/accounts/owner/users/'+member.id+'/reset-password',{},ownerCookie)
  assert.equal(reset.status,200)
  assert.match(reset.data.temporaryPassword,/^[A-Za-z]{12}$/)
  assert.equal((await request('/api/projects',null,beforeReset.cookie)).status,401,'reset revokes earlier sessions')
  assert.equal((await login(member.email,password)).status,401)
  const temporary=await login(member.email,reset.data.temporaryPassword)
  assert.equal(temporary.status,200)
  assert.equal((await request('/api/accounts/me',null,temporary.cookie)).data.user.mustChangePassword,true)
  assert.equal((await request('/api/projects',null,temporary.cookie)).data.code,'PASSWORD_CHANGE_REQUIRED')
  assert.equal((await request('/api/accounts/sessions',null,temporary.cookie)).data.code,'PASSWORD_CHANGE_REQUIRED')
  assert.equal((await request('/api/auth/change-password',{currentPassword:reset.data.temporaryPassword,newPassword:'Bypass attempt password!'},temporary.cookie)).data.code,'PASSWORD_CHANGE_REQUIRED')
  await request('/api/auth/sign-out',{},temporary.cookie)
  const again=await login(member.email,reset.data.temporaryPassword)
  assert.equal((await request('/api/accounts/me',null,again.cookie)).data.user.mustChangePassword,true,'leaving and signing in again does not clear the persistent requirement')
  const ownPassword='My chosen replacement password!'
  assert.equal((await request('/api/accounts/password-required',{newPassword:'too short'},again.cookie)).status,400)
  assert.equal((await request('/api/accounts/password-required',{newPassword:ownPassword},again.cookie)).status,200)
  assert.equal((await request('/api/accounts/me',null,again.cookie)).data.user.mustChangePassword,false)
  assert.equal((await login(member.email,reset.data.temporaryPassword)).status,401)
  const memberLogin=await login(member.email,ownPassword),otherLogin=await login(other.email)
  assert.equal(memberLogin.status,200)
  assert.equal((await request('/api/auth/list-sessions',null,ownerCookie)).status,200,'all library freshness checks are disabled for a valid older session')

  await fs.mkdir(path.join(root,'public/uploads'),{recursive:true})
  for(const name of ['shared.jpg','unused.jpg','co-owned.jpg']) {
    await fs.writeFile(path.join(root,'public/uploads',name),'sample '+name)
    db.prepare("INSERT INTO resources(kind,id,owner,bytes) VALUES('asset',?,?,?)").run('/uploads/'+name,member.id,20)
  }
  const project=await request('/api/projects',{title:'My retained tour'},memberLogin.cookie)
  assert.equal(project.status,201)
  const id=project.data.id
  const edited={...project.data,scenes:[{...project.data.scenes[0],image:'/uploads/shared.jpg'}],expectedDraftRevision:project.data.meta.draftRevision}
  assert.equal((await request('/api/projects/'+id+'/draft',edited,memberLogin.cookie,'PUT')).status,200)
  await publishProject(id)
  assert.equal((await request('/api/projects/'+id+'/access',{visibility:'public',members:[]},memberLogin.cookie,'PUT')).status,200)
  const sharedProject=await request('/api/projects',{title:'Another person’s tour'},otherLogin.cookie)
  assert.equal((await request('/api/projects/'+sharedProject.data.id+'/draft',{...sharedProject.data,scenes:[{...sharedProject.data.scenes[0],image:'/uploads/shared.jpg'}],expectedDraftRevision:sharedProject.data.meta.draftRevision},otherLogin.cookie,'PUT')).status,200)
  assert.equal((await request('/api/projects/'+sharedProject.data.id+'/access',{visibility:'private',owners:[{user:other.id},{user:member.id}]},otherLogin.cookie,'PUT')).status,200)
  const coOwned=await request('/api/projects',{title:'Our project'},memberLogin.cookie),coId=coOwned.data.id
  assert.equal((await request('/api/projects/'+coId+'/draft',{...coOwned.data,scenes:[{...coOwned.data.scenes[0],image:'/uploads/co-owned.jpg'}],expectedDraftRevision:coOwned.data.meta.draftRevision},memberLogin.cookie,'PUT')).status,200)
  await publishProject(coId)
  assert.equal((await request('/api/projects/'+coId+'/access',{visibility:'public',owners:[{user:member.id},{user:other.id}]},memberLogin.cookie,'PUT')).status,200)
  const deletionSummary=(await request('/api/accounts/users/'+member.id+'/deletion-summary',null,memberLogin.cookie)).data
  assert.equal(deletionSummary.projects,3)
  assert.equal(deletionSummary.retainedProjects,2)
  assert.equal(deletionSummary.deletedProjects,1)
  const confirm={email:member.email,confirmation:'DELETE'}
  assert.equal((await request('/api/accounts/users/'+member.id+'/deletion',{...confirm,email:'wrong@management.test'},memberLogin.cookie)).status,400)
  assert.equal((await request('/api/accounts/users/'+member.id+'/deletion-summary',null,otherLogin.cookie)).status,403)
  assert.equal((await request('/api/accounts/users/'+owner.id+'/deletion',{email:owner.email,confirmation:'DELETE'},ownerCookie)).status,403)
  const exported=await request('/api/accounts/users/'+member.id+'/export',confirm,memberLogin.cookie)
  assert.equal(exported.status,200,JSON.stringify(exported.data))
  const download=await request(exported.data.downloadUrl,null,memberLogin.cookie)
  assert.equal(download.status,200)
  const archive=await zipContents(download.data)
  assert.ok(archive.has(`projects/${id}.3dvr.zip`))
  assert.ok(archive.has(`projects/${coId}.3dvr.zip`))
  assert.ok(archive.has(`projects/${sharedProject.data.id}.3dvr.zip`),'exports include all equally owned projects, irrespective of who created them')
  assert.ok(archive.has('assets/uploads/unused.jpg'),'unreferenced owned media is included too')
  const projectArchive=await zipContents(archive.get(`projects/${id}.3dvr.zip`))
  assert.ok([...projectArchive.keys()].some(name=>name.endsWith('/shared.jpg')))
  assert.equal((await request(exported.data.downloadUrl,null,memberLogin.cookie)).status,404,'account download tickets work once')

  const scheduled=await request('/api/accounts/users/'+member.id+'/deletion',confirm,memberLogin.cookie)
  assert.equal(scheduled.status,202)
  assert.ok(Math.abs(scheduled.data.deleteAfter-Date.now()-30*86400000)<10000)
  assert.equal((await request('/api/projects',null,memberLogin.cookie)).status,401)
  assert.equal((await request('/api/projects/'+id+'/manifest')).status,401,'pending deletion hides the user’s published tours')
  assert.equal((await request('/api/projects/'+coId+'/manifest')).status,200,'another owner keeps the published project available during account deletion')
  assert.equal((await request('/api/projects/'+coId+'/draft',null,otherLogin.cookie)).status,200,'account deletion does not block the other owner')
  assert.ok((await request('/api/projects',null,otherLogin.cookie)).data.some(project=>project.id===coId))
  assert.ok(await fs.stat(path.join(root,'public/uploads/unused.jpg')))
  const rescued=await login(member.email,ownPassword)
  assert.equal(rescued.status,200)
  assert.equal((await request('/api/accounts/me',null,rescued.cookie)).data.user.deletionPending,false)
  assert.match((await request('/api/accounts/me',null,rescued.cookie)).data.notice,/canceled/)
  assert.equal((await request('/api/projects/'+id+'/draft',null,rescued.cookie)).status,200)

  assert.equal((await request('/api/accounts/owner/users/'+member.id,{suspended:true},ownerCookie)).status,200)
  assert.equal((await login(member.email,ownPassword)).status,403,'suspension blocks sign-in')
  assert.equal((await request('/api/accounts/owner/users/'+member.id,{suspended:false},ownerCookie)).status,200)
  const finalLogin=await login(member.email,ownPassword)
  assert.equal(finalLogin.status,200)
  assert.equal((await request('/api/accounts/users/'+member.id+'/deletion',confirm,ownerCookie)).status,202,'the owner can schedule a member’s deletion')
  db.prepare('UPDATE account_controls SET deleteAfter=? WHERE userId=?').run(Date.now()-1000,member.id)
  assert.equal((await login(member.email,ownPassword)).status,401,'sign-in after the deadline cannot revive the account')
  assert.equal((await request('/api/projects/'+coId+'/access',{visibility:'public',owners:[{user:member.id},{user:other.id}]},otherLogin.cookie,'PUT')).status,409,'expired accounts cannot be added back during cleanup')
  const panoramaId='delete-panorama',jobId='11111111-1111-4111-8111-111111111111'
  db.prepare("INSERT INTO resources(kind,id,owner,bytes) VALUES('panorama',?,?,0)").run(panoramaId,member.id)
  for(const directory of ['jobs','work/.processing-'+jobId,'panoramas/'+panoramaId,'masters']) await fs.mkdir(path.join(root,directory),{recursive:true})
  await fs.writeFile(path.join(root,'jobs',jobId+'.json'),JSON.stringify({id:jobId,source:{uploadId:panoramaId}}))
  await fs.writeFile(path.join(root,'masters',panoramaId+'.png'),'panorama source')
  db.prepare('INSERT INTO grants(project,owner) VALUES(?,?)').run('default',member.id)
  await purgeDeletedAccounts()
  assert.equal(db.prepare('SELECT id FROM user WHERE id=?').get(member.id),undefined)
  assert.equal(await fs.stat(path.join(root,'data/projects',id)).then(()=>true).catch(()=>false),false)
  assert.equal(await fs.stat(path.join(root,'public/uploads/unused.jpg')).then(()=>true).catch(()=>false),false)
  for(const removed of ['jobs/'+jobId+'.json','work/.processing-'+jobId,'panoramas/'+panoramaId,'masters/'+panoramaId+'.png']) assert.equal(await fs.stat(path.join(root,removed)).then(()=>true).catch(()=>false),false,'panorama lifecycle files are removed: '+removed)
  assert.ok(await fs.stat(path.join(root,'public/uploads/shared.jpg')))
  assert.equal(db.prepare("SELECT owner FROM resources WHERE id='/uploads/shared.jpg'").get().owner,other.id,'media referenced by another project is preserved for that owner')
  assert.equal((await request('/api/projects/'+sharedProject.data.id+'/draft',null,otherLogin.cookie)).status,200)
  assert.equal((await listProjects()).some(project=>project.id==='default'),false,'deleted legacy default projects cannot be re-created automatically')
  assert.equal(db.prepare('SELECT userId FROM account_controls WHERE userId=?').get(member.id),undefined)
  assert.equal((await request('/api/projects/'+coId+'/draft',null,otherLogin.cookie)).status,200,'the complete project survives the creator’s permanent deletion')
  assert.equal((await request('/api/projects/'+coId+'/manifest')).status,200)
  assert.ok(await fs.stat(path.join(root,'public/uploads/co-owned.jpg')))
  assert.equal(db.prepare("SELECT owner FROM resources WHERE id='/uploads/co-owned.jpg'").get().owner,other.id)
  assert.equal(db.prepare('SELECT owner FROM grants WHERE project=?').get(coId).owner,other.id)
  assert.ok(db.prepare("SELECT owner FROM resources WHERE kind='snapshot' AND id LIKE ?").all(coId+'/%').every(row=>row.owner===other.id),'retained project snapshots stay registered')
  assert.equal((await request('/api/projects/'+coId+'/access',null,otherLogin.cookie)).data.owners.length,1)
  assert.equal(db.prepare('SELECT 1 FROM members WHERE user=?').get(member.id),undefined)

  const otherConfirmation={email:other.email,confirmation:'DELETE'}
  assert.equal((await request('/api/accounts/users/'+other.id+'/deletion',otherConfirmation,ownerCookie)).status,202)
  db.prepare('UPDATE account_controls SET deleteAfter=? WHERE userId=?').run(Date.now()-1000,other.id)
  await purgeDeletedAccounts()
  for(const projectId of [coId,sharedProject.data.id]) {
    assert.equal(await fs.stat(path.join(root,'data/projects',projectId)).then(()=>true).catch(()=>false),false,'the project is removed when its last owner is permanently deleted')
    assert.equal(db.prepare('SELECT 1 FROM grants WHERE project=?').get(projectId),undefined)
  }
  for(const filename of ['co-owned.jpg','shared.jpg']) assert.equal(await fs.stat(path.join(root,'public/uploads',filename)).then(()=>true).catch(()=>false),false)

  const mfaUser=(await auth.api.createUser({body:{email:'mfa-delete@management.test',name:'MFA member',password,role:'user'}})).user
  const mfaLogin=await login(mfaUser.email)
  const mfaSetup=await request('/api/auth/two-factor/enable',{password},mfaLogin.cookie)
  const mfaCode=await createOTP(base32.decode(new URL(mfaSetup.data.totpURI).searchParams.get('secret'))).totp()
  const mfaEnrolled=await request('/api/auth/two-factor/verify-totp',{code:mfaCode},mfaLogin.cookie)
  const mfaConfirmation={email:mfaUser.email,confirmation:'DELETE'}
  assert.equal((await request('/api/accounts/users/'+mfaUser.id+'/deletion',mfaConfirmation,mfaEnrolled.cookie)).status,202)
  const passwordOnly=await login(mfaUser.email)
  assert.equal(passwordOnly.data.twoFactorRedirect,true)
  assert.ok(db.prepare('SELECT deleteAfter FROM account_controls WHERE userId=?').get(mfaUser.id).deleteAfter,'a password-only attempt cannot cancel deletion for an MFA account')
  const completeLogin=await request('/api/auth/two-factor/verify-backup-code',{code:mfaSetup.data.backupCodes[0]},passwordOnly.cookie)
  assert.equal(completeLogin.status,200)
  assert.equal(db.prepare('SELECT deleteAfter FROM account_controls WHERE userId=?').get(mfaUser.id).deleteAfter,null,'verified MFA sign-in cancels deletion')
  assert.equal((await request('/api/accounts/users/'+mfaUser.id+'/deletion',mfaConfirmation,ownerCookie)).status,202)
  db.prepare('UPDATE account_controls SET deleteAfter=? WHERE userId=?').run(Date.now()-1000,mfaUser.id)
  await purgeDeletedAccounts()
  assert.equal(db.prepare('SELECT userId FROM twoFactor WHERE userId=?').get(mfaUser.id),undefined)
  assert.equal(db.prepare('SELECT id FROM user WHERE id=?').get(mfaUser.id),undefined)

  const departing=[]
  for(const name of ['first','second']) departing.push((await auth.api.createUser({body:{email:name+'-last@management.test',name,password,role:'user'}})).user)
  const firstLogin=await login(departing[0].email)
  const finalProject=await request('/api/projects',{title:'Both owners leaving'},firstLogin.cookie),finalId=finalProject.data.id
  assert.equal((await request('/api/projects/'+finalId+'/access',{visibility:'private',owners:departing.map(user=>({user:user.id}))},firstLogin.cookie,'PUT')).status,200)
  for(const user of departing) {
    assert.equal((await request('/api/accounts/users/'+user.id+'/deletion',{email:user.email,confirmation:'DELETE'},ownerCookie)).status,202)
    db.prepare('UPDATE account_controls SET deleteAfter=? WHERE userId=?').run(Date.now()-1000,user.id)
  }
  await purgeDeletedAccounts()
  assert.equal(db.prepare('SELECT 1 FROM grants WHERE project=?').get(finalId),undefined,'accounts expiring together cannot strand a project under a deleted owner')
  assert.equal(await fs.stat(path.join(root,'data/projects',finalId)).then(()=>true).catch(()=>false),false)
})
