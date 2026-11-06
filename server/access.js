import { canAuthorProjects } from '../src/accountCapabilities.js'
import { securityDb, audit } from './identity.js'
import { getProjectDraft, getPublishedManifest } from './projectStore.js'

export function grant(id) { return securityDb().prepare('SELECT * FROM grants WHERE project=?').get(id) }
export function permission(user,id) {
  if (!canAuthorProjects(user)) return null
  const g = grant(id)
  if (g?.owner === user.id) return 'owner'
  return securityDb().prepare('SELECT permission FROM members WHERE project=? AND user=?').get(id,user.id)?.permission || null
}
export function references(value, result = new Set()) {
  if (typeof value === 'string' && /^\/(uploads|media\/panoramas)\//.test(value)) result.add(value.split(/[?#]/)[0])
  else if (Array.isArray(value)) for (const item of value) references(item,result)
  else if (value && typeof value === 'object') for (const item of Object.values(value)) references(item,result)
  return result
}
function matches(ref,url) {
  if (ref === url) return true
  const p = ref.match(/^(\/media\/panoramas\/[^/]+)\//)
  return Boolean(p && url.startsWith(p[1] + '/'))
}
export function resourceKey(url) {
  const p = url.match(/^\/media\/panoramas\/([^/]+)/)
  return p ? ['panorama',p[1]] : ['asset',url]
}
export function ownResource(user,url) {
  const [kind,id] = resourceKey(url)
  return Boolean(canAuthorProjects(user) && securityDb().prepare('SELECT 1 FROM resources WHERE kind=? AND id=? AND owner=?').get(kind,id,user.id))
}
export function claimResource(user,url) {
  const [kind,id] = resourceKey(url)
  securityDb().prepare('INSERT OR IGNORE INTO resources(kind,id,owner) VALUES(?,?,?)').run(kind,id,user.id)
}
export async function mediaAllowed(user,url, publicOnly = false) {
  if (!publicOnly && ownResource(user,url)) return true
  for (const g of securityDb().prepare('SELECT * FROM grants').all()) {
    const p = permission(user,g.project)
    if (!publicOnly && ['owner','edit'].includes(p)) {
      const draft = await getProjectDraft(g.project).catch(() => null)
      if ([...references(draft)].some(ref => matches(ref,url))) return true
    }
    if (g.visibility === 'public' || (!publicOnly && p)) {
      const published = await getPublishedManifest(g.project).catch(() => null)
      if ([...references(published)].some(ref => matches(ref,url))) return true
    }
  }
  return false
}
const denied = (req,res) => res.status(req.identity ? 403 : 401).json({ error:'Access denied.' })
export async function accessGate(req,res,next) {
  const user = req.identity?.user
  if (user?.banned) { req.identity = null; return denied(req,res) }
  const pathname = req.path
  if (pathname.startsWith('/uploads/') || pathname.startsWith('/media/panoramas/')) {
    let url
    try { url = decodeURIComponent(pathname) } catch { return res.sendStatus(400) }
    if (url.includes('..') || url.includes('\\') || url.endsWith('.part')) return res.sendStatus(404)
    if (!await mediaAllowed(user,url)) return denied(req,res)
    res.set('Cache-Control','private, no-store')
    return next()
  }
  if (!pathname.startsWith('/api/')) return next()
  if (pathname === '/api/health') return next()
  res.set('Cache-Control','no-store')
  if (pathname.startsWith('/api/scenes') || pathname.startsWith('/api/guides')) return res.status(410).json({ error:'Use project-scoped APIs.' })
  const match = pathname.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/)
  if (match) {
    const id = match[1], operation = match[2], g = grant(id), p = permission(user,id)
    if (operation === 'manifest' && req.method === 'GET') {
      if (!p && g?.visibility !== 'public') return denied(req,res)
    } else if (!['owner','edit'].includes(p)) return denied(req,res)
    if (operation === 'access') {
      if (p !== 'owner') return denied(req,res)
      if (req.method === 'GET') return res.json({ ...g, members:securityDb().prepare('SELECT m.user,m.permission,u.email FROM members m JOIN user u ON u.id=m.user WHERE project=?').all(id) })
      if (req.method !== 'PUT') return res.sendStatus(405)
      const { visibility } = req.body || {}
      const members = Array.isArray(req.body?.members) ? req.body.members.map(m => ({ user: m.email ? securityDb().prepare("SELECT id FROM user WHERE email=? AND role IN ('user','owner')").get(String(m.email).trim().toLowerCase())?.id : m.user, permission:m.permission })) : null
      if (!['private','public'].includes(visibility) || !Array.isArray(members) || members.length > 100) return res.sendStatus(400)
      if (members.some(m => !['view','edit'].includes(m.permission) || !securityDb().prepare("SELECT id FROM user WHERE id=? AND role IN ('user','owner')").get(m.user))) return res.sendStatus(400)
      securityDb().transaction(() => {
        securityDb().prepare('UPDATE grants SET visibility=? WHERE project=?').run(visibility,id)
        securityDb().prepare('DELETE FROM members WHERE project=?').run(id)
        for (const m of members) securityDb().prepare('INSERT OR REPLACE INTO members VALUES(?,?,?)').run(id,m.user,m.permission)
      })()
      audit(user.id,'project-access',id)
      return res.json({ ok:true })
    }
  } else if (!canAuthorProjects(user)) return denied(req,res)
  if (pathname === '/api/projects' && req.method === 'POST' && req.body?.duplicateFrom && !['owner','edit'].includes(permission(user,req.body.duplicateFrom))) return denied(req,res)
  const transfer = pathname.match(/^\/api\/project-transfers\/export\/([^/]+)$/)
  if (transfer && !['owner','edit'].includes(permission(user,transfer[1]))) return denied(req,res)
  const panorama = pathname.match(/^\/api\/panorama-(?:uploads|jobs)\/([^/]+)/)
  if (panorama && !ownResource(user,`/media/panoramas/${panorama[1]}/manifest.json`)) return denied(req,res)
  if (['/api/assets/thumbnail','/api/assets/model-thumbnail'].includes(pathname) && !await mediaAllowed(user,String(req.query.url || '')) && !String(req.query.url).startsWith('/demo/')) return denied(req,res)
  if (pathname === '/api/assets' && req.method === 'DELETE' && !ownResource(user,String(req.query.url || ''))) return denied(req,res)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for (const ref of references(req.body)) if (!await mediaAllowed(user,ref)) return denied(req,res)
  }
  const original = res.json.bind(res)
  res.json = body => {
    if (res.statusCode < 400 && user) {
      if (req.method !== 'GET' && (pathname === '/api/projects' || match) && (body?.revision || body?.manifest?.revision)) {
        const snapshot=body.manifest || body
        const id=snapshot.id+'/'+snapshot.revision
        securityDb().prepare("INSERT INTO resources(kind,id,owner,bytes) VALUES('snapshot',?,?,?) ON CONFLICT(kind,id) DO UPDATE SET bytes=excluded.bytes").run(id,grant(snapshot.id)?.owner || user.id,Buffer.byteLength(JSON.stringify(snapshot))*2)
      }
      if (pathname === '/api/assets' && req.method === 'DELETE' && body?.fileDeleted) securityDb().prepare("DELETE FROM resources WHERE kind='asset' AND id=? AND owner=?").run(body.url,user.id)
      if ((pathname === '/api/projects' || pathname === '/api/project-transfers/import') && req.method === 'POST' && body?.id) {
        securityDb().prepare("INSERT INTO grants(project,owner) VALUES(?,?)").run(body.id,user.id)
        if (pathname.endsWith('/import')) {
          for (const item of body.mediaResources || []) {
            claimResource(user,item.url)
            const [kind,id]=resourceKey(item.url)
            securityDb().prepare('UPDATE resources SET bytes=? WHERE kind=? AND id=? AND owner=?').run(item.bytes,kind,id,user.id)
          }
        }
        audit(user.id,'project-create',body.id)
      }
      if (pathname === '/api/upload' && body?.url) {
        claimResource(user,body.url)
        securityDb().prepare("UPDATE resources SET bytes=? WHERE kind='asset' AND id=? AND owner=?").run(body.bytes,body.url,user.id)
      }
      if (pathname === '/api/panorama-uploads' && body?.uploadId) {
        claimResource(user,`/media/panoramas/${body.uploadId}/manifest.json`)
        securityDb().prepare("UPDATE resources SET bytes=? WHERE kind='panorama' AND id=? AND owner=?").run(Number(req.body.size),body.uploadId,user.id)
      }
      if (pathname === '/api/projects' && Array.isArray(body)) body = body.filter(p => ['owner','edit'].includes(permission(user,p.id))).map(p => ({...p,permission:permission(user,p.id)}))
      if (match?.[2] === 'manifest' && body?.id) body = { ...body, offlineAccount:grant(body.id)?.visibility === 'private' ? user.id : null }
      if (pathname === '/api/assets' && Array.isArray(body)) body = body.filter(a => a.source === 'demo' || ownResource(user,a.url))
    }
    return original(body)
  }
  next()
}
