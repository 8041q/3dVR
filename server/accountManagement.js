import crypto from 'node:crypto'
import { getAuth, securityDb, audit } from './identity.js'
import { accountControls, decorateAccount } from './accountState.js'
import { revokeAccountSessions, scheduleAccountDeletion } from './accountLifecycle.js'
import { listOwnDevices, revokeOwnDevices } from './sessionDevices.js'
import { prepareAccountExport, writeAccountExport } from './accountExport.js'
import { accountProjects, survivingProjectOwners } from './projectOwnership.js'
import { createAvatarRouter } from './avatars.js'

const failure=(message,status=400)=>Object.assign(new Error(message),{status})
export async function resetMemberPassword(userId,actor) {
  const db=securityDb(), user=db.prepare('SELECT * FROM user WHERE id=?').get(userId)
  if(!user || user.role!=='user') throw failure('Only member passwords can be reset here.',403)
  const state=accountControls(db,userId)
  if(state.purging || (state.deleteAfter && state.deleteAfter<=Date.now())) throw failure('This account is being permanently deleted.',409)
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const temporaryPassword=Array.from({length:12},()=>alphabet[crypto.randomInt(alphabet.length)]).join('')
  const context=await getAuth().$context, digest=await context.password.hash(temporaryPassword)
  db.transaction(()=> {
    if(!db.prepare("UPDATE account SET password=? WHERE userId=? AND providerId='credential'").run(digest,userId).changes) throw failure('This account has no password credential.',409)
    db.prepare('INSERT INTO account_controls(userId,mustChangePassword,resetVersion) VALUES(?,1,1) ON CONFLICT(userId) DO UPDATE SET mustChangePassword=1,resetVersion=resetVersion+1').run(userId)
    db.prepare('DELETE FROM invitations WHERE email=?').run(user.email)
    revokeAccountSessions(userId)
    audit(actor,'temporary-password-issued',userId)
  })()
  return {temporaryPassword,mustChangePassword:true}
}
export function createAccountManagementRouter(express,{ownerOnly}) {
  const router=express.Router(), downloads=new Map(), exporting=new Set()
  const run=handler=>async(req,res,next)=> {try{await handler(req,res)}catch(error){if(error.status)res.status(error.status).json({error:error.message});else next(error)}}
  router.use((req,res,next)=> {
    if(!req.identity) return res.status(401).json({error:'Sign in required.'})
    if(req.identity.user.deletionPending || req.identity.user.purging) return res.status(403).json({error:'This account is scheduled for deletion. Sign in to cancel it.'})
    if(req.identity.user.mustChangePassword && req.path!=='/password-required') return res.status(403).json({error:'Choose a new password to continue.',code:'PASSWORD_CHANGE_REQUIRED'})
    if(req.identity.user.role==='owner' && !req.identity.user.twoFactorEnabled) return res.status(403).json({error:'Finish owner account setup first.'})
    next()
  })
  router.use('/me/avatar',createAvatarRouter(express))
  function target(req,{confirmation=false}={}) {
    const actor=req.identity.user, id=req.params.id
    if(actor.id!==id && !(actor.role==='owner' && actor.twoFactorEnabled)) throw failure('Access denied.',403)
    const user=securityDb().prepare('SELECT id,email,name,role,banned FROM user WHERE id=?').get(id)
    if(!user || user.role!=='user') throw failure('Only member accounts can be deleted here.',403)
    const state=accountControls(securityDb(),id)
    if(state.purging || (state.deleteAfter && state.deleteAfter<=Date.now())) throw failure('The account deletion deadline has passed.',410)
    if(confirmation && (String(req.body?.email || '').trim().toLowerCase()!==user.email.toLowerCase() || req.body?.confirmation!=='DELETE')) throw failure('Type the account email and confirm deletion.')
    return user
  }
  router.post('/password-required',run(async(req,res)=> {
    const {newPassword}=req.body || {}, db=securityDb(), user=req.identity.user
    if(!user.mustChangePassword) throw failure('A password change is not required.',409)
    if(typeof newPassword!=='string' || newPassword.length<15 || newPassword.length>128) throw failure('Choose a password of 15–128 characters.')
    const state=accountControls(db,user.id), context=await getAuth().$context, digest=await context.password.hash(newPassword)
    db.transaction(()=> {
      if(!db.prepare('SELECT id FROM session WHERE id=? AND userId=?').get(req.identity.session.id,user.id)) throw failure('This session has ended. Sign in using the latest temporary password.',401)
      const changed=db.prepare('UPDATE account_controls SET mustChangePassword=0 WHERE userId=? AND mustChangePassword=1 AND resetVersion=?').run(user.id,state.resetVersion)
      if(!changed.changes) throw failure('The password was reset again. Sign in using the latest temporary password.',409)
      db.prepare("UPDATE account SET password=? WHERE userId=? AND providerId='credential'").run(digest,user.id)
      db.prepare('DELETE FROM session_details WHERE userId=? AND sessionId<>?').run(user.id,req.identity.session.id)
      db.prepare('DELETE FROM session WHERE userId=? AND id<>?').run(user.id,req.identity.session.id)
      db.prepare("DELETE FROM verification WHERE value=? AND identifier LIKE 'trust-device-%'").run(user.id)
      audit(user.id,'required-password-changed',user.id)
    })()
    res.json({ok:true})
  }))
  router.get('/sessions',run(async(req,res)=>res.json(await listOwnDevices(req.identity))))
  router.post('/sessions/revoke',run(async(req,res)=> {
    if(!['all','others'].includes(req.body?.scope)) throw failure('Choose all devices or other devices.')
    res.json(revokeOwnDevices(req.identity,req.body.scope))
  }))
  router.delete('/sessions/:sessionId',run(async(req,res)=>res.json(revokeOwnDevices(req.identity,'single',req.params.sessionId))))
  router.post('/owner/users/:id/reset-password',ownerOnly,run(async(req,res)=>res.json(await resetMemberPassword(req.params.id,req.identity.user.id))))
  router.get('/users/:id/deletion-summary',run(async(req,res)=> {
    const user=target(req), db=securityDb()
    const projects=accountProjects(db,user.id),retainedProjects=projects.filter(project=>survivingProjectOwners(db,project.project,user.id).length).length
    res.json({user:decorateAccount(db,user),projects:projects.length,retainedProjects,deletedProjects:projects.length-retainedProjects,assets:db.prepare("SELECT COUNT(*) AS count FROM resources WHERE owner=? AND kind IN ('asset','panorama')").get(user.id).count})
  }))
  router.post('/users/:id/export',run(async(req,res)=> {
    const user=target(req,{confirmation:true}), actor=req.identity.user.id
    if(exporting.has(actor)) throw failure('An account export is already being prepared or downloaded.',429)
    exporting.add(actor)
    try {
      const bundle=await prepareAccountExport(user.id)
      if(req.aborted || res.destroyed || res.closed) {exporting.delete(actor);return}
      const ticket=crypto.randomBytes(32).toString('hex')
      const timer=setTimeout(()=>{downloads.delete(ticket);exporting.delete(actor)},600000);timer.unref()
      downloads.set(ticket,{bundle,actor,timer})
      res.json({downloadUrl:`/api/accounts/exports/${ticket}`,filename:bundle.filename,projects:bundle.projects.length,assets:bundle.files.length})
    } catch(error) {exporting.delete(actor);throw error}
  }))
  router.get('/exports/:ticket',run(async(req,res)=> {
    const entry=downloads.get(req.params.ticket)
    if(!entry || entry.actor!==req.identity.user.id) throw failure('This download expired. Prepare another export.',404)
    downloads.delete(req.params.ticket);clearTimeout(entry.timer)
    res.set('Referrer-Policy','no-referrer').type('application/zip').attachment(entry.bundle.filename)
    try {await writeAccountExport(entry.bundle,res)}catch(error){if(!res.headersSent)throw error;res.destroy(error)}finally{exporting.delete(entry.actor)}
  }))
  router.post('/users/:id/deletion',run(async(req,res)=> {
    const user=target(req,{confirmation:true})
    res.status(202).json(scheduleAccountDeletion(user.id,req.identity.user.id))
  }))
  return router
}