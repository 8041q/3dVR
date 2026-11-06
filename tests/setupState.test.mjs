import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
test('an uninitialized installation displays setup status while authentication remains closed',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atria-firstboot-'))
 Object.assign(process.env,{VR_STORAGE_ROOT:root,VR_SECURITY_ROOT:':memory:',AUTH_SECRET_FILE:path.join(root,'missing.secret'),APP_ORIGIN:'http://localhost:5173'})
 const {identity}=await import('../server/auth.js')
 const {authHandler,createAccountsRouter}=await import('../server/accounts.js')
 const app=express();app.use('/api/auth',authHandler());app.use(express.json());app.use(identity);app.use('/api/accounts',createAccountsRouter(express))
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true})})
 const base='http://127.0.0.1:'+server.address().port
 const status=await(await fetch(base+'/api/accounts/me')).json()
 assert.deepEqual(status,{user:null,installation:{state:'needs-initialization'}})
 const login=await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
 assert.equal(login.status,503)
 const accept=await fetch(base+'/api/accounts/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
 assert.equal(accept.status,503)
})
