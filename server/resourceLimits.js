import fs from 'node:fs/promises'
import { securityDb } from './identity.js'
import { STORAGE_ROOT } from './storagePaths.js'
import { accountProjects } from './projectOwnership.js'
const active = new Map()
let transfers = 0, reserved = 0
export async function resourceLimits(req,res,next) {
  const user=req.identity?.user
  if (!user || !['POST','PUT'].includes(req.method)) return next()
  const isImport=req.path === '/api/project-transfers/import'
  const projectWrite=/^\/api\/projects(?:\/[^/]+\/(draft|publish|publish-draft))?$/.test(req.path)
  const upload=req.path === '/api/upload' || req.path === '/api/panorama-uploads'
  if (!upload && !isImport && !projectWrite) return next()
  if(req.path==='/api/projects' && accountProjects(securityDb(),user.id).length>=100) return res.status(413).json({error:'Account project limit reached.'})
  const quota=Number(process.env.USER_STORAGE_QUOTA_BYTES) || 50*1024**3
  const declared=isImport ? Number(process.env.MAX_PROJECT_EXTRACT_BYTES)||20*1024**3 : projectWrite ? Math.max(1048576,Number(req.get('Content-Length'))||0) : req.path.endsWith('panorama-uploads') ? Number(req.body?.size) : Number(req.get('Content-Length'))
  if (!Number.isSafeInteger(declared) || declared<=0) return res.status(411).json({error:'A positive upload size is required.'})
  const used=securityDb().prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM resources WHERE owner=?').get(user.id).bytes
  if (used+declared>quota) return res.status(413).json({error:'Account storage quota exceeded.'})
  if ((active.get(user.id)||0)>=1 || (isImport && transfers>=1)) return res.status(429).json({error:'Another upload or import is active. Try again shortly.'})
  const disk=await fs.statfs(STORAGE_ROOT)
  const free=Number(disk.bavail)*Number(disk.bsize)
  if (free-reserved < declared + (isImport ? Number(process.env.MAX_PROJECT_IMPORT_BYTES)||10*1024**3 : 0) + 1024**3) return res.status(507).json({error:'Insufficient server disk space.'})
  reserved+=declared
  active.set(user.id,(active.get(user.id)||0)+1)
  if(isImport) transfers++
  let released=false
  const release=()=>{if(released)return;released=true;reserved-=declared;active.set(user.id,(active.get(user.id)||1)-1);if(isImport)transfers--}
  res.once('finish',release);res.once('close',release)
  next()
}
