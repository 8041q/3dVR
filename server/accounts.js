import fs from 'node:fs/promises'
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { applicationOrigin, trustedApplicationOrigins } from './origin.js'

import { STORAGE_ROOT } from './storagePaths.js'

import { toNodeHandler } from 'better-auth/node'

import { getAuth, securityDb, invitation, tokenHash, audit, installationStatus } from './identity.js'

import { identity } from './auth.js'
import { createAccountManagementRouter, resetMemberPassword } from './accountManagement.js'
import { accountControls, decorateAccount, cancelScheduledDeletion } from './accountState.js'
import { revokeAccountSessions } from './accountLifecycle.js'
import { avatarUrlFor } from './avatars.js'

const require = createRequire(import.meta.url)
const packageMetadata = require('../package.json')
const APP_VERSION = typeof packageMetadata.version === 'string' ? packageMetadata.version : 'unknown'

const DEFAULT_USER_QUOTA_BYTES = 50 * 1024 ** 3
const DEFAULT_ASSET_UPLOAD_BYTES = 2 * 1024 ** 3
const DEFAULT_PROJECT_SIZE_BYTES = 10 * 1024 ** 3
const DEFAULT_MAX_PROJECTS_PER_ACCOUNT = 100

const REQUIRED_NODE_MAJOR = 22
const REQUIRED_NODE_MINOR = 13
const REQUIRED_NODE_PATCH = 0

function configuredLimit(name, fallback) {
  const value = Number(process.env[name])
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

function finiteBytes(value) {
  const bytes = Number(value)
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null
}

function parseNodeVersion(versionString) {
  const match = String(versionString || '').match(/^v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

function nodeVersionMeetsRequirement(versionString, requiredMajor, requiredMinor, requiredPatch = 0) {
  const version = parseNodeVersion(versionString)
  if (!version) return false
  if (version.major > requiredMajor) return true
  if (version.major < requiredMajor) return false
  if (version.minor > requiredMinor) return true
  if (version.minor < requiredMinor) return false
  return version.patch >= requiredPatch
}

function authStorageValid() {
  const secretFile = process.env.AUTH_SECRET_FILE || path.join(STORAGE_ROOT, 'security', 'auth.secret')
  try {
    return existsSync(secretFile) && readFileSync(secretFile, 'utf8').trim().length >= 43
  } catch {
    return false
  }
}

function getSetting(db, key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key)
  if (!row) return fallback
  try { return JSON.parse(row.value) } catch { return row.value }
}

function setSetting(db, key, value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  db.prepare('INSERT INTO settings(key,value,updatedAt) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=CURRENT_TIMESTAMP').run(key, serialized)
}

async function diskUsage() {
  try {
    const disk = await fs.statfs(STORAGE_ROOT)
    const blockSize = finiteBytes(disk.bsize)
    const blocks = finiteBytes(disk.blocks)
    const availableBlocks = finiteBytes(disk.bavail)
    if (blockSize === null || blocks === null || availableBlocks === null) return { available:false, totalBytes:null, freeBytes:null, usedBytes:null }
    const totalBytes = blockSize * blocks
    const freeBytes = blockSize * availableBlocks
    if (!Number.isSafeInteger(totalBytes) || !Number.isSafeInteger(freeBytes)) return { available:false, totalBytes:null, freeBytes:null, usedBytes:null }
    return { available:true, totalBytes, freeBytes, usedBytes:Math.max(0,totalBytes-freeBytes) }
  } catch {
    // Status remains available on filesystems which do not provide statfs.
    return { available:false, totalBytes:null, freeBytes:null, usedBytes:null }
  }
}

async function installationOverview(db) {
  const origin = applicationOrigin()
  const users = db.prepare(`SELECT
    COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN role='owner' THEN 1 ELSE 0 END),0) AS owners,
    COALESCE(SUM(CASE WHEN banned=1 THEN 1 ELSE 0 END),0) AS suspended,
    COALESCE(SUM(CASE WHEN controls.deleteAfter IS NOT NULL AND controls.deleteAfter>? THEN 1 ELSE 0 END),0) AS pendingDeletion
    FROM user
    LEFT JOIN account_controls AS controls ON controls.userId=user.id`).get(Date.now())
  const projects = db.prepare(`SELECT
    COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN visibility='public' THEN 1 ELSE 0 END),0) AS public
    FROM grants`).get()
  const resources = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(bytes),0) AS bytes FROM resources').get()
  const activeSessions = db.prepare('SELECT COUNT(*) AS count FROM session').get().count
  const disk = await diskUsage()
  const userQuotaBytes = configuredLimit('USER_STORAGE_QUOTA_BYTES', DEFAULT_USER_QUOTA_BYTES)
  const trustedOrigins = trustedApplicationOrigins()
  const accountTotal = Number(users.total)
  const suspendedAccounts = Number(users.suspended)

  const owner = db.prepare("SELECT id FROM user WHERE role='owner'").get()
  let ownerMfaConfigured = false
  try {
    const ownerWithMfa = db.prepare("SELECT twoFactorEnabled FROM user WHERE role='owner'").get()
    ownerMfaConfigured = Boolean(ownerWithMfa?.twoFactorEnabled)
  } catch {
    // twoFactorEnabled column may not exist on user table; check twoFactor table instead
    try {
      ownerMfaConfigured = Boolean(owner && db.prepare("SELECT 1 FROM twoFactor WHERE userId=?").get(owner.id))
    } catch {}
  }

  const nodeVersionOk = nodeVersionMeetsRequirement(process.version, REQUIRED_NODE_MAJOR, REQUIRED_NODE_MINOR, REQUIRED_NODE_PATCH)
  const production = process.env.NODE_ENV === 'production'

  let databaseIntegrity = false
  try {
    const result = db.prepare('PRAGMA integrity_check').get()
    databaseIntegrity = result && result.integrity_check === 'ok'
  } catch {}

  const storage = {
    production,
    nodeVersionOk,
    httpsConfigured: Boolean(origin.startsWith('https:')),
    ownerMfaConfigured,
    registrationDisabled: true,
    authStorageValid: authStorageValid(),
    databaseIntegrity,
    storageAvailable: Boolean(disk.available && disk.freeBytes > 0),
  }

  return {
    generatedAt:new Date().toISOString(),
    server:{
      appVersion:APP_VERSION,
      nodeVersion:process.version,
      uptimeSeconds:Math.max(0,Math.floor(process.uptime())),
      publicOrigin:origin,
      https:origin.startsWith('https:'),
      dynamicHosts:process.env.APP_DYNAMIC_HOSTS!=='0',
      trustedOriginCount:trustedOrigins.length,
      registration:'disabled',
      ownerMfaRequired:true,
      memberMfaOptional:true,
      sessionHours:12,
      mfaGraceHours:2
    },
    usage:{
      accounts:accountTotal,
      activeAccounts:Math.max(0,accountTotal-suspendedAccounts),
      suspendedAccounts,
      pendingDeletionAccounts:Number(users.pendingDeletion),
      projects:Number(projects.total),
      publicProjects:Number(projects.public),
      resources:Number(resources.count),
      storageBytes:Number(resources.bytes),
      activeSessions:Number(activeSessions)
    },
    limits:{
      userQuotaBytes:getSetting(db, 'USER_STORAGE_QUOTA_BYTES', userQuotaBytes),
      assetUploadBytes:getSetting(db, 'MAX_ASSET_UPLOAD_BYTES', configuredLimit('MAX_ASSET_UPLOAD_BYTES', DEFAULT_ASSET_UPLOAD_BYTES)),
      maxProjectsPerAccount:getSetting(db, 'MAX_PROJECTS_PER_ACCOUNT', DEFAULT_MAX_PROJECTS_PER_ACCOUNT),
      projectSizeBytes:getSetting(db, 'MAX_PROJECT_SIZE_BYTES', configuredLimit('MAX_PROJECT_SIZE_BYTES', DEFAULT_PROJECT_SIZE_BYTES)),
    },
    security: storage,
    // Keep the original object shape, while extending it with disk health and
    // global tracked storage for existing clients.
    hosting:{ ...disk, userQuotaBytes:getSetting(db, 'USER_STORAGE_QUOTA_BYTES', userQuotaBytes), activeSessions:Number(activeSessions), trackedBytes:Number(resources.bytes) }
  }
}



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
    handler ||= toNodeHandler(async request=> {
      const response=await getAuth().handler(request)
      const authPath=new URL(request.url).pathname.replace(/^\/api\/auth/,'')
      if(['/sign-in/email','/two-factor/verify-totp','/two-factor/verify-backup-code'].includes(authPath) && response.ok) {
        // Validate the final response after all MFA hooks. Provisional sessions
        // created by the password step cannot cancel a scheduled deletion.
        const cookies=new Map()
        for(const value of response.headers.getSetCookie()) {
          const pair=value.split(';')[0],split=pair.indexOf('=')
          cookies.set(pair.slice(0,split),pair.slice(split+1))
        }
        const session=await getAuth().api.getSession({headers:new Headers({Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')})})
        if(cancelScheduledDeletion(securityDb(),session)) audit(session.user.id,'account-deletion-canceled',session.user.id)
      }
      return response
    })

    await identity(req, res, () => {})
    if(req.identity?.user.mustChangePassword && !['/sign-in/email','/sign-out','/get-session'].includes(req.path)) return res.status(403).json({error:'Choose a new password to continue.',code:'PASSWORD_CHANGE_REQUIRED'})

    if (req.identity?.user.role === 'owner') {

      if (req.path === '/two-factor/disable' || (req.path === '/two-factor/enable' && req.identity.user.twoFactorEnabled)) return res.sendStatus(403)


    }

    return handler(req,res,next)

  }

}

export function createAccountsRouter(express) {

  const r = express.Router()

  r.use((_req, res, next) => { res.set('Cache-Control','no-store'); next() })

  r.get('/me', async (req,res) => {
    const state=req.identity && accountControls(securityDb(),req.identity.user.id)
    const canceled=state?.deletionCanceledAt && state.deletionCanceledAt>=new Date(req.identity.session.createdAt).getTime()-2000
    const user=req.identity?.user ? {...req.identity.user,avatarUrl:await avatarUrlFor(req.identity.user.id)} : null
    res.json({user,installation:installationStatus(),...(canceled ? {notice:'Your scheduled account deletion was canceled because you signed in.'} : {})})
  })

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

        // Ensure the display name is persisted. better-auth may not include it in
        // the session user object, so write it directly to the user table.
        db.prepare("UPDATE user SET name=? WHERE email=?").run(name.trim(), row.email)

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
    const overview = await installationOverview(db)

    res.json({ ...overview, users: db.prepare('SELECT id,email,name,role,banned,twoFactorEnabled FROM user').all().map(user=>decorateAccount(db,user)), events: db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 100').all() })

  })

  r.get('/owner/settings', ownerOnly, async (_req,res) => {

    const db = securityDb()
    const rows = db.prepare('SELECT key,value FROM settings').all()
    const settings = {}
    for (const row of rows) {
      try { settings[row.key] = JSON.parse(row.value) } catch { settings[row.key] = row.value }
    }
    res.json(settings)

  })

  r.post('/owner/settings', ownerOnly, async (req,res) => {

    const db = securityDb()
    const { key, value } = req.body || {}
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'Setting key is required.' })
    if (value === undefined) return res.status(400).json({ error: 'Setting value is required.' })

    const allowedKeys = ['USER_STORAGE_QUOTA_BYTES','MAX_ASSET_UPLOAD_BYTES','MAX_PROJECTS_PER_ACCOUNT','MAX_PROJECT_SIZE_BYTES']
    if (!allowedKeys.includes(key)) return res.status(400).json({ error: 'This setting cannot be changed from the UI.' })

    const numeric = Number(value)
    if (!Number.isSafeInteger(numeric) || numeric < 0) return res.status(400).json({ error: 'Value must be a non-negative integer.' })

    setSetting(db, key, numeric)
    audit(req.identity.user.id,'setting-update',key)
    res.json({ ok: true })

  })

  r.post('/owner/invitations', ownerOnly, async (req,res,next) => {

    const email = String(req.body?.email || '').trim().toLowerCase()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.sendStatus(400)

    const reset = req.body?.reset === true
    if(reset) {
      const user=securityDb().prepare('SELECT id FROM user WHERE email=?').get(email)
      try {return res.json(await resetMemberPassword(user?.id,req.identity.user.id))} catch(error) {if(error.status)return res.status(error.status).json({error:error.message});return next(error)}
    }

    const token = invitation(email,'user')

    audit(req.identity.user.id,'invite',email)

    res.json({ url: `/account#invite=${token}` })

  })

  r.post('/owner/users/:id', ownerOnly, (req,res) => {

    const db = securityDb(), user = db.prepare('SELECT role FROM user WHERE id=?').get(req.params.id)

    if (!user || user.role === 'owner') return res.sendStatus(403)
    if(typeof req.body?.suspended!=='boolean') return res.status(400).json({error:'Device sessions are managed privately by the account holder.'})

    db.prepare('UPDATE user SET banned=?,banExpires=NULL WHERE id=?').run(req.body.suspended ? 1 : 0,req.params.id)

    revokeAccountSessions(req.params.id)

    audit(req.identity.user.id,'account-update',req.params.id)

    res.json({ ok:true })

  })

  r.use(createAccountManagementRouter(express,{ownerOnly}))
  return r

}