import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import https from 'node:https'
import express from 'express'
import { getCertificate } from '@vitejs/plugin-basic-ssl'

test('HTTPS activation creates a password and login issues a usable Secure cookie', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-https-'))
  const certificate = await getCertificate(path.join(root, 'certificate'))
  const app = express()
  const server = https.createServer({ key: certificate, cert: certificate }, app).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await fs.rm(root, { recursive: true, force: true })
  })
  const origin = `https://127.0.0.1:${server.address().port}`
  Object.assign(process.env, { APP_ORIGIN: origin, APP_TRUSTED_ORIGINS:'https://192.168.60.60:5173', VR_STORAGE_ROOT: root, VR_SECURITY_ROOT: ':memory:', AUTH_SECRET_FILE: path.join(root, 'auth.secret') })
  await fs.writeFile(process.env.AUTH_SECRET_FILE, crypto.randomBytes(48).toString('hex'))
  const { getAuth, invitation } = await import('../server/identity.js')
  const { sameOrigin, authHandler, createAccountsRouter } = await import('../server/accounts.js')
  const { identity } = await import('../server/auth.js')
  await (await getAuth().$context).runMigrations()
  app.use((req, _res, next) => { req.headers['x-atria-client-ip'] = req.socket.remoteAddress; next() })
  app.use(sameOrigin)
  app.use('/api/auth', authHandler())
  app.use(express.json())
  app.use(identity)
  app.use('/api/accounts', createAccountsRouter(express))
  function request(route, body, cookie, requestOrigin = origin) {
    return new Promise((resolve, reject) => {
      // Only this test's local development certificate bypasses CA validation.
      const req = https.request(origin + route, { rejectUnauthorized: false, method: body ? 'POST' : 'GET', headers: { Origin: requestOrigin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) } }, res => {
        let text = ''
        res.on('data', chunk => { text += chunk })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) }))
      })
      req.on('error', reject)
      req.end(body ? JSON.stringify(body) : undefined)
    })
  }
  const token = invitation('owner@example.test', 'owner')
  const password = 'Exhibition setup test password!'
  assert.equal((await request('/api/accounts/accept', { token, name: 'Owner', password }, null, origin.replace('https:', 'http:'))).status, 403)
  const activated=await request('/api/accounts/accept', { token, name: 'Owner', password },null,'https://192.168.60.60:5173')
  assert.equal(activated.status,200)
  assert.equal(activated.body.signedIn,true)
  const activationCookie=activated.headers['set-cookie'].map(value=>value.split(';')[0]).join('; ')
  assert.equal((await request('/api/accounts/me',null,activationCookie)).body.user.email,'owner@example.test','activation advances directly into authenticated setup')
  const login = await request('/api/auth/sign-in/email', { email: 'owner@example.test', password })
  assert.equal(login.status, 200)
  const cookies = login.headers['set-cookie'] || []
  assert.ok(cookies.some(cookie => /session_token/.test(cookie) && /; Secure/i.test(cookie) && /; HttpOnly/i.test(cookie)))
  const cookie = cookies.map(value => value.split(';')[0]).join('; ')
  assert.equal((await request('/api/accounts/me', null, cookie)).body.user.email, 'owner@example.test')
})
