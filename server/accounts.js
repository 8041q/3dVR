import fs from 'node:fs/promises'
import { applicationOrigin, trustedApplicationOrigins } from './origin.js'

import { STORAGE_ROOT } from './storagePaths.js'

import { toNodeHandler } from 'better-auth/node'

import { getAuth, securityDb, invitation, tokenHash, audit, installationStatus } from './identity.js'

import { identity } from './auth.js'



export function sameOrigin(req, res, next) {

  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next()

  if (!trustedApplicationOrigins().includes(req.get('Origin'))) return res.status(403).json({ error: 'This address is not enabled for sign-in. Use the server’s main address.', code:'ORIGIN_MISMATCH', signInUrl:applicationOrigin()+'/account' })

  next()

}

export function ownerOnly(req, res, next) {

  const s = req.identity

  if (!s || s.user.role !== 'owner' || !s.user.twoFactorEnabled || s.user.banned) return res.status(403).json({ error: 'Owner login with MFA required.' })

  // identity() already checks session expiry and revocation. An authenticated
  // owner can manage users for that session without a separate five-minute limit.

  next()

}

const paths = new Set(['/sign-in/email','/sign-out','/get-session','/change-password','/list-sessions','/revoke-session','/revoke-other-sessions','/two-factor/enable','/two-factor/verify-totp','/two-factor/verify-backup-code','/two-factor/disable','/two-factor/get-totp-uri','/two-factor/generate-backup-codes'])

export function authHandler() {

  let handler

  return async (req, res, next) => {

    if (!paths.has(req.path)) return res.sendStatus(404)
    if(installationStatus().state==='needs-initialization') return res.status(503).json({error:'Server setup is not complete.',code:'SETUP_REQUIRED'})
    handler ||= toNodeHandler(getAuth())

    await identity(req, res, () => {})

    if (req.identity?.user.role === 'owner') {

      if (req.path === '/two-factor/disable' || (req.path === '/two-factor/enable' && req.identity.user.twoFactorEnabled)) return res.sendStatus(403)


    }

    return handler(req, res, next)

  }

}

export function createAccountsRouter(express) {

  const r = express.Router()

  r.use((_req, res, next) => { res.set('Cache-Control','no-store'); next() })

  r.get('/me', (req,res) => res.json({ user: req.identity?.user || null, installation:installationStatus() }))

  r.post('/accept', async (req,res) => {
    if(installationStatus().state==='needs-initialization') return res.status(503).json({error:'Run the setup command in the server terminal first.',code:'SETUP_REQUIRED'})

    const { token, password, name } = req.body || {}

    if (typeof password !== 'string' || password.length < 15 || password.length > 128 || typeof name !== 'string' || !name.trim() || name.length > 100) return res.status(400).json({ error: 'Provide a name and a password of 15–128 characters.' })

    const db = securityDb(), digest = tokenHash(token)

    const row = db.prepare('SELECT * FROM invitations WHERE hash=? AND used=0 AND expires>?').get(digest,Date.now())

    if (!row || !db.prepare('UPDATE invitations SET used=1 WHERE hash=? AND used=0').run(digest).changes) return res.status(400).json({ error: 'Invitation is invalid or expired.' })

    try {

      const existing = db.prepare('SELECT id, role FROM user WHERE email=?').get(row.email)

      const ownerRecovery=row.role==='owner-recovery' && existing?.role==='owner'
      if (existing) {

        if (!ownerRecovery && (row.role !== 'reset' || existing.role === 'owner')) throw new Error('Account already exists.')

        const ctx = await getAuth().$context

        const digest = await ctx.password.hash(password)

        const updated=db.prepare("UPDATE account SET password=? WHERE userId=? AND providerId='credential'").run(digest,existing.id)
        if(!updated.changes) await ctx.internalAdapter.linkAccount({providerId:'credential',accountId:existing.id,password:digest,userId:existing.id})
        if(ownerRecovery) db.prepare('UPDATE user SET banned=0,twoFactorEnabled=0 WHERE id=?').run(existing.id)

        db.prepare('DELETE FROM session WHERE userId=?').run(existing.id)
        db.prepare("DELETE FROM verification WHERE value=? AND identifier LIKE 'trust-device-%'").run(existing.id)

      } else {

        if (row.role === 'reset' || row.role==='owner-recovery') throw new Error('Account does not exist.')

        await getAuth().api.createUser({ body: { email: row.email, name: name.trim(), password, role: row.role } })

      }

      audit('invitation','accept',row.email)

      if (!existing || ownerRecovery) {
        const login=await getAuth().api.signInEmail({body:{email:row.email,password},asResponse:true})
        if (!login.ok) throw new Error('Account created but automatic sign-in failed.')
        const cookies=login.headers.getSetCookie()
        if(cookies.length) res.setHeader('Set-Cookie',cookies)
      }
      res.json({ ok: true, signedIn:!existing || ownerRecovery })

    } catch (error) {

      console.error('[accounts:accept]',error)

      res.status(400).json({ error: 'Could not activate account. Request a new invitation.' })

    }

  })

  r.get('/owner', ownerOnly, async (_req,res) => {

    const db = securityDb()

    const disk=await fs.statfs(STORAGE_ROOT)

    res.json({ hosting:{ freeBytes:Number(disk.bavail)*Number(disk.bsize), userQuotaBytes:Number(process.env.USER_STORAGE_QUOTA_BYTES)||50*1024**3, activeSessions:db.prepare('SELECT COUNT(*) AS count FROM session').get().count }, users: db.prepare('SELECT id,email,name,role,banned,twoFactorEnabled FROM user').all(), events: db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 100').all() })

  })

  r.post('/owner/invitations', ownerOnly, (req,res) => {

    const email = String(req.body?.email || '').trim().toLowerCase()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.sendStatus(400)

    const reset = req.body?.reset === true

    if (reset && securityDb().prepare('SELECT role FROM user WHERE email=?').get(email)?.role === 'owner') return res.sendStatus(403)

    const token = invitation(email,reset ? 'reset' : 'user')

    audit(req.identity.user.id,reset ? 'password-reset-link' : 'invite',email)

    res.json({ url: `/account#invite=${token}` })

  })

  r.post('/owner/users/:id', ownerOnly, (req,res) => {

    const db = securityDb(), user = db.prepare('SELECT role FROM user WHERE id=?').get(req.params.id)

    if (!user || user.role === 'owner') return res.sendStatus(403)

    if (typeof req.body?.suspended === 'boolean') db.prepare('UPDATE user SET banned=? WHERE id=?').run(req.body.suspended ? 1 : 0,req.params.id)

    db.prepare('DELETE FROM session WHERE userId=?').run(req.params.id)
    db.prepare("DELETE FROM verification WHERE value=? AND identifier LIKE 'trust-device-%'").run(req.params.id)

    audit(req.identity.user.id,'account-update',req.params.id)

    res.json({ ok:true })

  })

  return r

}

