import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { betterAuth } from 'better-auth'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'
import { admin, twoFactor } from 'better-auth/plugins'
import { hash, verify } from '@node-rs/argon2'
import { STORAGE_ROOT } from './storagePaths.js'
import { createAuthMiddleware, isAPIError } from 'better-auth/api'
import { applicationOrigin, trustedApplicationOrigins } from './origin.js'
let database, auth
export function securityDb() {
  if (database) return database
  const root = process.env.VR_SECURITY_ROOT || path.join(STORAGE_ROOT, 'security')
  if(root !== ':memory:') fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  database = new Database(root === ':memory:' ? root : path.join(root, 'accounts.sqlite'))
  database.pragma('journal_mode = WAL')
  database.exec(`
    CREATE TABLE IF NOT EXISTS grants (project TEXT PRIMARY KEY, owner TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'private');
    CREATE TABLE IF NOT EXISTS members (project TEXT, user TEXT, permission TEXT CHECK(permission IN ('view','edit')), PRIMARY KEY(project,user));
    CREATE TABLE IF NOT EXISTS resources (kind TEXT, id TEXT, owner TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,id));
    CREATE TABLE IF NOT EXISTS invitations (hash TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, at TEXT DEFAULT CURRENT_TIMESTAMP, actor TEXT, action TEXT, target TEXT);
  `)
  if (!database.prepare('PRAGMA table_info(resources)').all().some(c=>c.name==='bytes')) database.exec('ALTER TABLE resources ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0')
  return database
}
export function audit(actor, action, target = '') { securityDb().prepare('INSERT INTO events(actor,action,target) VALUES(?,?,?)').run(actor, action, target) }
export const tokenHash = token => crypto.createHash('sha256').update(String(token)).digest('hex')
export function invitation(email, role = 'user', minutes = 60) {
  const token = crypto.randomBytes(32).toString('hex')
  securityDb().prepare('INSERT INTO invitations(hash,email,role,expires) VALUES(?,?,?,?)').run(tokenHash(token), email.trim().toLowerCase(), role, Date.now() + minutes * 60000)
  return token
}
export function getAuth() {
  if (auth) return auth
  const secretFile = process.env.AUTH_SECRET_FILE || path.join(STORAGE_ROOT, 'security', 'auth.secret')
  if (!fs.existsSync(secretFile)) throw new Error('Run npm run accounts -- init before starting the server.')
  const secret = fs.readFileSync(secretFile, 'utf8').trim()
  if (secret.length < 43) throw new Error('Authentication secret must contain at least 32 random bytes.')
  const baseURL = applicationOrigin()
  if (process.env.NODE_ENV === 'production' && !baseURL.startsWith('https://')) throw new Error('APP_ORIGIN must use HTTPS in production.')
  auth = betterAuth({
    database: securityDb(), secret, baseURL, trustedOrigins: () => trustedApplicationOrigins(),
    hooks: { before:createAuthMiddleware(async ctx => {
      if(ctx.path !== '/sign-in/email') return
      const cookie=ctx.context.createAuthCookie('trust_device')
      const trusted=await ctx.getSignedCookie(cookie.name,ctx.context.secret)
      if(!trusted) return
      const identifier=trusted.split('!')[1]
      if(!identifier?.startsWith('trust-device-')) return
      const record=await ctx.context.internalAdapter.findVerificationValue(identifier)
      if(record && new Date(record.expiresAt).getTime()>Date.now()) ctx.context.mfaGraceExpiresAt=record.expiresAt
    }), after:createAuthMiddleware(async ctx => {
      if(['/change-password','/revoke-other-sessions','/revoke-session','/two-factor/enable','/two-factor/disable'].includes(ctx.path) && ctx.context.session && !isAPIError(ctx.context.returned)) {
        securityDb().prepare("DELETE FROM verification WHERE value=? AND identifier LIKE 'trust-device-%'").run(ctx.context.session.user.id)
      }
      const previous=ctx.context.session, current=ctx.context.newSession
      if(ctx.path==='/two-factor/verify-totp' && previous?.user.role==='owner' && !previous.user.twoFactorEnabled && current?.user.twoFactorEnabled) {
        // Keep only the session whose second factor was just verified.
        securityDb().prepare('DELETE FROM session WHERE userId=? AND id<>?').run(current.user.id,current.session.id)
        await ctx.context.adapter.update({model:'session',where:[{field:'id',value:current.session.id}],update:{createdAt:new Date()}})
      }
    }) },
    // The library rotates trusted-device tokens at sign-in. Keep the original
    // deadline so password logins cannot extend grace beyond two hours after MFA.
    databaseHooks:{verification:{create:{before:async (record,ctx) => {
      if(record.identifier.startsWith('trust-device-') && ctx?.context.mfaGraceExpiresAt) return {data:{...record,expiresAt:new Date(ctx.context.mfaGraceExpiresAt)}}
    }}}},
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 15, maxPasswordLength: 128, revokeSessionsOnPasswordReset: true,
      password: { hash: password => hash(password, { memoryCost: 65536, timeCost: 3, parallelism: 1, algorithm: 2 }), verify: ({ hash: digest, password }) => verify(digest, password) } },
    session: { expiresIn: 43200, freshAge: 300, disableSessionRefresh: true, cookieCache: { enabled: false } },
    advanced: { ipAddress: { ipAddressHeaders:['x-atria-client-ip'] }, useSecureCookies: baseURL.startsWith('https:'), defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30 },
    plugins: [admin({ adminRoles: ['owner'], defaultRole: 'user', roles:{owner:adminAc,user:userAc} }), twoFactor({ issuer: 'Atria 3DVR', trustDeviceMaxAge:7200, backupCodeOptions: { storeBackupCodes: 'encrypted' } })],
  })
  return auth
}

export function installationStatus() {
  const secretFile=process.env.AUTH_SECRET_FILE || path.join(STORAGE_ROOT,'security','auth.secret')
  if (!fs.existsSync(secretFile)) return {state:'needs-initialization'}
  const db=securityDb()
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user'").get()) return {state:'needs-initialization'}
  const owner=db.prepare("SELECT twoFactorEnabled FROM user WHERE role='owner'").get()
  return {state:owner ? owner.twoFactorEnabled ? 'ready' : 'needs-authenticator' : 'needs-activation'}
}
