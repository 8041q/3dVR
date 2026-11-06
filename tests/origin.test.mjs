import assert from 'node:assert/strict'
import test from 'node:test'
import { applicationOrigin, developmentEnvironment, trustedApplicationOrigins, machineOrigins } from '../server/origin.js'

test('development HTTPS configures both client TLS and the API trusted origin', () => {
  for (const [env,forceHttps,expected] of [[{},true,'https://localhost:5173'],[{APP_ORIGIN:'https://localhost:5173'},false,'https://localhost:5173'],[{APP_ORIGIN:'http://192.168.60.60:5173'},true,'https://192.168.60.60:5173']]) {
    const development=developmentEnvironment(env,forceHttps)
    assert.equal(development.APP_ORIGIN,expected)
    assert.equal(development.VITE_DEV_HTTPS,'1')
    assert.ok(trustedApplicationOrigins(development).includes(expected))
    assert.ok(trustedApplicationOrigins(development).includes('https://localhost:5173'))
    assert.ok(!trustedApplicationOrigins(development).some(value=>value.includes('*')))
  }
  assert.equal(applicationOrigin({ VITE_DEV_HTTPS: '1' }), 'https://localhost:5173')
  assert.equal(applicationOrigin({}), 'http://localhost:5173')
})

test('trusted origins normalize a trailing slash and reject ambiguous URLs', () => {
  assert.equal(applicationOrigin({ APP_ORIGIN: 'https://example.test/' }), 'https://example.test')
  for (const url of ['file:///secret', 'https://example.test/account', 'https://user:pass@example.test', 'https://example.test/?query=1', 'https://example.test/#fragment']) {
    assert.throws(() => applicationOrigin({ APP_ORIGIN: url }))
  }
})

test('production origins are explicit and cannot be chosen by arbitrary browser headers', () => {
  assert.deepEqual(trustedApplicationOrigins({APP_ORIGIN:'https://atriatours.test',NODE_ENV:'production',APP_DYNAMIC_HOSTS:'0'}),['https://atriatours.test'])
  assert.deepEqual(trustedApplicationOrigins({APP_ORIGIN:'https://atriatours.test',APP_TRUSTED_ORIGINS:'https://exhibit.test',APP_DYNAMIC_HOSTS:'0'}),['https://atriatours.test','https://exhibit.test'])
  assert.throws(()=>trustedApplicationOrigins({APP_TRUSTED_ORIGINS:'https://example.test/unsafe'}))
  assert.throws(()=>trustedApplicationOrigins({APP_ORIGIN:'https://example.test',APP_TRUSTED_ORIGINS:'https://*.example.test'}))
  assert.throws(()=>trustedApplicationOrigins({NODE_ENV:'production',APP_ORIGIN:'https://example.test',APP_TRUSTED_ORIGINS:'http://exhibit.test'}))
})

test('development follows interface changes without pinning old addresses or trusting arbitrary hosts',()=>{
 const env={...developmentEnvironment({},true),NODE_ENV:'development'}
 const first={ethernet:[{address:'192.168.1.10',family:'IPv4'}]}
 const second={ethernet:[{address:'10.0.0.20',family:'IPv4'}]}
 assert.ok(trustedApplicationOrigins(env,first).includes('https://192.168.1.10:5173'))
 assert.ok(trustedApplicationOrigins(env,second).includes('https://10.0.0.20:5173'))
 assert.ok(!trustedApplicationOrigins(env,second).includes('https://192.168.1.10:5173'))
 assert.ok(!trustedApplicationOrigins(env,second).includes('https://attacker.test:5173'))
 assert.ok(trustedApplicationOrigins({...env,NODE_ENV:'production'},second).includes('https://10.0.0.20:5173'))
 assert.deepEqual(trustedApplicationOrigins({...env,NODE_ENV:'production',APP_DYNAMIC_HOSTS:'0'},first),['https://localhost:5173'])
 assert.ok(machineOrigins('https://localhost:8443',{loopback:[{address:'::1',family:'IPv6'}]}).includes('https://[::1]:8443'))
})
test('configured public hostnames use the same application regardless of the machines address',()=>{
 const env={APP_ORIGIN:'https://primary.test',APP_PUBLIC_HOSTS:'tour.test,exhibition.test:8443',NODE_ENV:'production',APP_DYNAMIC_HOSTS:'0'}
 assert.deepEqual(trustedApplicationOrigins(env,{}),['https://primary.test','https://tour.test','https://exhibition.test:8443'])
})
