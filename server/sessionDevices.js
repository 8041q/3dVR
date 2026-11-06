import { getAuth, securityDb } from './identity.js'
import { normalizedIp, approximateLocation, deviceName } from './deviceInfo.js'

export async function recordSessionActivity(identity, address) {
  const db=securityDb(), id=identity.session.id, ip=normalizedIp(address)
  const previous=db.prepare('SELECT * FROM session_details WHERE sessionId=?').get(id)
  if(previous && previous.ip===ip && Date.now()-previous.lastSeenAt<30000) return
  const location=previous?.ip===ip ? previous.location : await approximateLocation(ip)
  db.prepare('INSERT INTO session_details(sessionId,userId,lastSeenAt,ip,location) VALUES(?,?,?,?,?) ON CONFLICT(sessionId) DO UPDATE SET lastSeenAt=excluded.lastSeenAt,ip=excluded.ip,location=excluded.location').run(id,identity.user.id,Date.now(),ip,location)
}
export async function listOwnDevices(identity) {
  const context=await getAuth().$context
  const sessions=await context.internalAdapter.listSessions(identity.user.id,{onlyActiveSessions:true})
  return Promise.all(sessions.filter(session=>new Date(session.expiresAt).getTime()>Date.now()).map(async session=> {
    const details=securityDb().prepare('SELECT * FROM session_details WHERE sessionId=? AND userId=?').get(session.id,identity.user.id)
    const ip=details?.ip || normalizedIp(session.ipAddress)
    return {id:session.id,current:session.id===identity.session.id,device:deviceName(session.userAgent),ip:ip || 'Unknown',location:details?.location || await approximateLocation(ip),createdAt:new Date(session.createdAt).toISOString(),lastSeenAt:new Date(details?.lastSeenAt || session.updatedAt || session.createdAt).toISOString()}
  }))
}
export function revokeOwnDevices(identity, scope, id) {
  const db=securityDb(), user=identity.user.id
  const sessions=scope==='single' ? db.prepare('SELECT id FROM session WHERE id=? AND userId=?').all(id,user) : scope==='others' ? db.prepare('SELECT id FROM session WHERE userId=? AND id<>?').all(user,identity.session.id) : db.prepare('SELECT id FROM session WHERE userId=?').all(user)
  if(scope==='single' && !sessions.length) throw Object.assign(new Error('Device session not found.'),{status:404})
  db.transaction(()=> {
    for(const session of sessions) {db.prepare('DELETE FROM session WHERE id=? AND userId=?').run(session.id,user);db.prepare('DELETE FROM session_details WHERE sessionId=? AND userId=?').run(session.id,user)}
    db.prepare("DELETE FROM verification WHERE value=? AND identifier LIKE 'trust-device-%'").run(user)
  })()
  return {ok:true,currentSignedOut:sessions.some(session=>session.id===identity.session.id),count:sessions.length}
}
