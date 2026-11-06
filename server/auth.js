import { getAuth, securityDb, installationStatus } from './identity.js'
import { canAuthorProjects } from '../src/accountCapabilities.js'
import { fromNodeHeaders } from 'better-auth/node'
import { decorateAccount } from './accountState.js'
import { recordSessionActivity } from './sessionDevices.js'
export async function identity(req, res, next) {
  if (installationStatus().state==='needs-initialization') {req.identity=null;return next()}
  try {
    req.identity = await getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) })
    if(req.identity) {
      const live=securityDb().prepare('SELECT banned FROM user WHERE id=?').get(req.identity.user.id)
      if(!live || live.banned) req.identity=null
      else {
        req.identity.user=decorateAccount(securityDb(),req.identity.user)
        if(!req.identity.user.deletionPending && !req.identity.user.purging) await recordSessionActivity(req.identity,req.get('x-atria-client-ip') || req.ip || req.socket.remoteAddress)
      }
    }
    next()
  } catch (error) { next(error) }
}
export function requireEditor(req, res, next) {
  if (!req.identity) return res.status(401).json({ error: 'Sign in required.' })
  if (!canAuthorProjects(req.identity.user)) return res.status(403).json({ error:'Finish your account setup before editing projects.' })
  next()
}
