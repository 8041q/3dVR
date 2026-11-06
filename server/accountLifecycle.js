import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { securityDb, audit } from './identity.js'
import { DELETION_DELAY } from './accountState.js'
import { DATA_ROOT, MEDIA_ROOT, PANORAMA_ROOT, MASTER_ROOT, INCOMING_ROOT, JOB_ROOT, WORK_ROOT } from './storagePaths.js'
import { deleteStoredProject } from './projectStore.js'
import { localModelDependencies } from './projectBundles.js'
import { removeAssetFromRegistry } from './assetRegistry.js'
import { removeStoredPath, safeStoredPath, storedFiles } from './accountFiles.js'
import { accountProjects, survivingProjectOwners, setProjectOwners } from './projectOwnership.js'

export function revokeAccountSessions(userId) {
  const db=securityDb()
  db.prepare('DELETE FROM session WHERE userId=?').run(userId)
  db.prepare('DELETE FROM session_details WHERE userId=?').run(userId)
  db.prepare("DELETE FROM verification WHERE value=? AND identifier LIKE 'trust-device-%'").run(userId)
}
export function scheduleAccountDeletion(userId, actor, now=Date.now()) {
  const db=securityDb(), user=db.prepare('SELECT role FROM user WHERE id=?').get(userId)
  if(!user || user.role!=='user') throw Object.assign(new Error('Only member accounts can be deleted here.'),{status:403})
  const previous=db.prepare('SELECT * FROM account_controls WHERE userId=?').get(userId)
  if(previous?.deleteAfter) return {ok:true,deleteAfter:previous.deleteAfter}
  db.transaction(()=> {
    db.prepare('INSERT INTO account_controls(userId,deletionRequestedAt,deleteAfter) VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET deletionRequestedAt=excluded.deletionRequestedAt,deleteAfter=excluded.deleteAfter,deletionCanceledAt=NULL').run(userId,now,now+DELETION_DELAY)
    revokeAccountSessions(userId)
    audit(actor,'account-deletion-scheduled',userId)
  })()
  return {ok:true,deleteAfter:now+DELETION_DELAY}
}
function mediaReferences(value, result=new Set()) {
  if(typeof value==='string' && /^\/(uploads|media\/panoramas)\//.test(value)) result.add(value.split(/[?#]/)[0])
  else if(Array.isArray(value)) value.forEach(item=>mediaReferences(item,result))
  else if(value && typeof value==='object') Object.values(value).forEach(item=>mediaReferences(item,result))
  return result
}
async function remainingReferences(userId, excluded=new Set()) {
  const result=new Map()
  for(const grant of securityDb().prepare('SELECT * FROM grants WHERE owner<>?').all(userId)) {
    if(excluded.has(grant.project)) continue
    if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(grant.project)) throw new Error('Invalid stored project identifier.')
    const files=await storedFiles(path.join(DATA_ROOT,'projects'),grant.project)
    const refs=new Set()
    for(const item of files.filter(file=>file.relative.endsWith('.json'))) mediaReferences(JSON.parse(await fs.readFile(item.file,'utf8')),refs)
    for(const ref of refs) {
      if(/\.(glb|gltf)$/i.test(ref) && ref.startsWith('/uploads/')) {
        const file=await safeStoredPath(path.join(MEDIA_ROOT,'uploads'),decodeURIComponent(ref.slice('/uploads/'.length)))
        if(file) for(const dependency of await localModelDependencies(file,ref).catch(()=>[])) refs.add(dependency)
      }
      if(!result.has(ref)) result.set(ref,grant.owner)
    }
  }
  return result
}
async function deleteAssetCache(file) {
  const real=await fs.realpath(file).catch(()=>null)
  if(!real) return
  const stat=await fs.stat(real)
  const key=crypto.createHash('sha256').update(`${real}:${stat.size}:${stat.mtimeMs}`).digest('hex')
  const cacheRoot=path.join(MEDIA_ROOT,'..','thumbnails')
  for(const name of [`${key}.webp`,`model-${key}.webp`]) await removeStoredPath(cacheRoot,name)
}
async function purgeAccount(user, now) {
  const db=securityDb()
  const affected=accountProjects(db,user.id), deleted=[]
  db.transaction(()=> {
    for(const {project} of affected) {
      const remaining=survivingProjectOwners(db,project,user.id,now)
      if(remaining.length) setProjectOwners(db,project,remaining)
      else deleted.push(project)
    }
  })()
  const retained=await remainingReferences(user.id,new Set(deleted))
  for(const project of deleted) await deleteStoredProject(project)
  for(const resource of db.prepare('SELECT * FROM resources WHERE owner=?').all(user.id)) {
    if(resource.kind==='snapshot') continue
    const source=resource.kind==='panorama' ? `/media/panoramas/${resource.id}/` : resource.id
    const successor=resource.kind==='panorama' ? [...retained].find(([url])=>url.startsWith(source))?.[1] : retained.get(source)
    if(successor) {db.prepare('UPDATE resources SET owner=? WHERE kind=? AND id=?').run(successor,resource.kind,resource.id);continue}
    if(resource.kind==='asset' && source.startsWith('/uploads/')) {
      const relative=decodeURIComponent(source.slice('/uploads/'.length)), root=path.join(MEDIA_ROOT,'uploads')
      const file=await safeStoredPath(root,relative)
      if(file) await deleteAssetCache(file)
      await removeStoredPath(root,relative)
      await removeAssetFromRegistry(source)
    } else if(resource.kind==='panorama' && /^[a-zA-Z0-9-]{1,100}$/.test(resource.id)) {
      await removeStoredPath(PANORAMA_ROOT,resource.id)
      await removeStoredPath(WORK_ROOT,resource.id)
      for(const root of [MASTER_ROOT,INCOMING_ROOT]) {
        for(const name of await fs.readdir(root).catch(()=>[])) if(name===resource.id || name.startsWith(resource.id+'.')) await removeStoredPath(root,name)
      }
      for(const name of await fs.readdir(JOB_ROOT).catch(()=>[])) if(name.endsWith('.json')) {
        const file=await safeStoredPath(JOB_ROOT,name)
        const job=JSON.parse(await fs.readFile(file,'utf8'))
        if(job.source?.uploadId===resource.id || job.output?.assetId===resource.id || job.uploadId===resource.id || job.id===resource.id) {
          if(/^[0-9a-f-]{36}$/i.test(job.id)) await removeStoredPath(WORK_ROOT,`.processing-${job.id}`)
          await removeStoredPath(JOB_ROOT,name)
        }
      }
    }
  }
  db.transaction(()=> {
    for(const project of deleted) {
      db.prepare('DELETE FROM members WHERE project=?').run(project)
      db.prepare('DELETE FROM grants WHERE project=?').run(project)
      db.prepare("DELETE FROM resources WHERE kind='snapshot' AND id LIKE ?").run(project+'/%')
      db.prepare('UPDATE events SET target=? WHERE target=?').run('deleted-project',project)
    }
    for(const table of ['members','resources']) db.prepare(`DELETE FROM ${table} WHERE ${table==='members'?'user':'owner'}=?`).run(user.id)
    db.prepare('DELETE FROM twoFactor WHERE userId=?').run(user.id)
    db.prepare('DELETE FROM session WHERE userId=?').run(user.id)
    db.prepare('DELETE FROM account WHERE userId=?').run(user.id)
    db.prepare('DELETE FROM user WHERE id=?').run(user.id)
    db.prepare('DELETE FROM session_details WHERE userId=?').run(user.id)
    db.prepare('DELETE FROM invitations WHERE email=?').run(user.email)
    db.prepare('DELETE FROM verification WHERE value=? OR value=?').run(user.id,user.email)
    db.prepare('UPDATE events SET actor=? WHERE actor=?').run('deleted-account',user.id)
    db.prepare('UPDATE events SET target=? WHERE target=? OR target=?').run('deleted-account',user.id,user.email)
    db.prepare('DELETE FROM account_controls WHERE userId=?').run(user.id)
    audit('server','account-deletion-completed',new Date(now).toISOString())
  })()
}
let cleanup
export function purgeDeletedAccounts(now=Date.now()) {
  if(cleanup) return cleanup
  cleanup=(async()=> {
    const db=securityDb()
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user'").get()) return
    const due=db.prepare("SELECT u.* FROM user u JOIN account_controls c ON c.userId=u.id WHERE u.role='user' AND c.deleteAfter<=?").all(now)
    const failures=[]
    for(const user of due) {
      const claimed=db.prepare('UPDATE account_controls SET purging=1 WHERE userId=? AND deleteAfter<=?').run(user.id,now)
      if(claimed.changes) try{await purgeAccount(user,now)}catch(error){failures.push(error)}
    }
    db.prepare('DELETE FROM session_details WHERE sessionId NOT IN (SELECT id FROM session)').run()
    const cacheRoot=path.join(MEDIA_ROOT,'..','thumbnails')
    for(const name of await fs.readdir(cacheRoot).catch(()=>[])) if(name.endsWith('.webp')) {
      const file=await safeStoredPath(cacheRoot,name), stat=file && await fs.stat(file)
      if(stat?.isFile() && now-stat.mtimeMs>=30*86400000) await removeStoredPath(cacheRoot,name)
    }
    if(failures.length) throw new AggregateError(failures,'Some account deletions need another cleanup attempt.')
  })().finally(()=>{cleanup=null})
  return cleanup
}
