import assert from 'node:assert/strict'
import test from 'node:test'
import {activationToken,safeReturnPath} from '../src/accountFlow.js'
import {getAppRoute} from '../src/routing.js'
test('home and editor entry open the workspace rather than an unauthorized default tour',()=>{
  for(const url of ['/','/account','/account/','/editor']) assert.equal(getAppRoute(url).kind,'account')
  assert.deepEqual(getAppRoute('/v/default'),{kind:'viewer',projectId:'default'})
  assert.deepEqual(getAppRoute('/editor/default'),{kind:'editor',projectId:'default'})
})
test('local setup accepts a CLI activation link on another permitted device without navigating away',()=>{
  const token='a'.repeat(64)
  assert.equal(activationToken(token),token)
  assert.equal(activationToken('https://localhost:5173/account#invite='+token),token)
  for(const value of ['invalid','javascript:alert(1)','https://example.test/#invite=invalid']) assert.equal(activationToken(value),null)
})
test('return navigation stays on a local project route',()=>{
  assert.equal(safeReturnPath('/v/exhibit'),'/v/exhibit')
  assert.equal(safeReturnPath('/editor/exhibit'),'/editor/exhibit')
  for(const value of ['https://evil.test','//evil.test','/account','/v/exhibit?redirect=evil','/v/../../anything']) assert.equal(safeReturnPath(value),null)
})

test('empty conditional message children never produce an alert',async()=>{
 const {hasNoticeContent}=await import('../src/noticeContent.js')
 const React=await import('react')
 assert.equal(hasNoticeContent(['',false]),false)
 assert.equal(hasNoticeContent([null,undefined,'  ']),false)
 assert.equal(hasNoticeContent(React.createElement(React.Fragment,null,'',false)),false)
 assert.equal(hasNoticeContent(['Incorrect code.',false]),true)
 assert.equal(hasNoticeContent(['',React.createElement('p',null,React.createElement('a',{href:'/account'},'Open sign-in'))]),true)
})
test('owner project access requires completed MFA and never implies access to other projects',async()=>{
 const {canAuthorProjects}=await import('../src/accountCapabilities.js')
 assert.equal(canAuthorProjects({role:'owner',twoFactorEnabled:false}),false)
 assert.equal(canAuthorProjects({role:'owner',twoFactorEnabled:true}),true)
 assert.equal(canAuthorProjects({role:'owner',twoFactorEnabled:true,banned:true}),false)
 assert.equal(canAuthorProjects({role:'user'}),true)
})
