import { getAuth, securityDb, installationStatus } from './identity.js'
import { canAuthorProjects } from '../src/accountCapabilities.js'
import { fromNodeHeaders } from 'better-auth/node'
export async function identity(req, res, next) {
  if (installationStatus().state==='needs-initialization') {req.identity=null;return next()}
  try { req.identity = await getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) }); if(req.identity && securityDb().prepare('SELECT banned FROM user WHERE id=?').get(req.identity.user.id)?.banned) req.identity=null; next() } catch (error) { next(error) }
}
export function requireEditor(req, res, next) {
  if (!req.identity) return res.status(401).json({ error: 'Sign in required.' })
  if (!canAuthorProjects(req.identity.user)) return res.status(403).json({ error:'Finish your account setup before editing projects.' })
  next()
}
