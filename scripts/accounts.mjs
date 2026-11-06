import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getAuth, securityDb, invitation, audit } from '../server/identity.js'
import { references, claimResource, resourceKey } from '../server/access.js'
import { exportProjectState } from '../server/projectStore.js'
import { STORAGE_ROOT, DATA_ROOT, MEDIA_ROOT } from '../server/storagePaths.js'
import { applicationOrigin, developmentEnvironment } from '../server/origin.js'
if (process.argv.includes('--https')) Object.assign(process.env, developmentEnvironment(process.env, true))
const [command,email,project] = process.argv.slice(2)
if (command === 'init') {
  for (const name of ['security','data','public/uploads','incoming','masters','jobs','panoramas','thumbnails','work']) fs.mkdirSync(path.join(STORAGE_ROOT,name),{recursive:true,mode:0o700})
  if (!fs.existsSync(path.join(STORAGE_ROOT,'public','demo'))) fs.cpSync('public/demo',path.join(STORAGE_ROOT,'public','demo'),{recursive:true})
  const file = process.env.AUTH_SECRET_FILE || path.join(STORAGE_ROOT,'security','auth.secret')
  fs.mkdirSync(path.dirname(file),{ recursive:true,mode:0o700 })
  if (!fs.existsSync(file)) fs.writeFileSync(file,crypto.randomBytes(48).toString('base64url'),{ flag:'wx',mode:0o600 })
}
const auth = getAuth()
await (await auth.$context).runMigrations()
const db = securityDb()
if (command === 'init' || command === 'recover') {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Supply an owner email identifier.')
  const owner = db.prepare("SELECT * FROM user WHERE role='owner'").get()
  if (command === 'init' && owner) throw new Error('An owner already exists. Use recover locally.')
  if (command === 'recover') {
    if (!owner || owner.email !== email.toLowerCase()) throw new Error('Use the existing owner email.')
    // Revoke access during recovery, preserving the identity that owns projects.
    db.prepare('DELETE FROM session WHERE userId=?').run(owner.id)
    db.prepare('DELETE FROM twoFactor WHERE userId=?').run(owner.id)
    db.prepare('UPDATE user SET banned=1,twoFactorEnabled=0 WHERE id=?').run(owner.id)
  }
  db.prepare("DELETE FROM invitations WHERE role IN ('owner','owner-recovery')").run()
  const token = invitation(email,command==='recover' ? 'owner-recovery' : 'owner',15)
  console.log(`${applicationOrigin()}/account#invite=${token}`)
  console.log('Open this link to choose your password before signing in. It expires in 15 minutes.')
  if (new URL(applicationOrigin()).port === '5173') console.log(`Start the app with npm run ${applicationOrigin().startsWith('https:') ? 'dev:https' : 'dev'}.`)
  audit('local',command,email)
} else if (command === 'migrate-data') {
  for (const [source,target] of [['server/data','data'],['public/uploads','public/uploads']]) {
    const destination=path.join(STORAGE_ROOT,target)
    if (fs.existsSync(source)) for(const entry of fs.readdirSync(source)) fs.cpSync(path.join(source,entry),path.join(destination,entry),{recursive:true,errorOnExist:true,force:false})
  }
  console.log('Copied legacy data. Assign each project to an account before serving it.')
} else if (command === 'assign') {
  const user = db.prepare("SELECT id FROM user WHERE email=? AND role IN ('user','owner')").get(email)
  if (!user || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(project || '')) throw new Error('Supply an account email and project id.')
  if(!fs.existsSync(path.join(DATA_ROOT,'projects',project,'meta.json'))) throw new Error('Project not found. Migrate or import it first.')
  const state=await exportProjectState(project)
  db.prepare("INSERT INTO grants(project,owner,visibility) VALUES(?,?,'private') ON CONFLICT(project) DO UPDATE SET owner=excluded.owner").run(project,user.id)
  for(const entry of state.files) {
    const value=entry.value || JSON.parse(fs.readFileSync(entry.file,'utf8'))
    for(const url of references(value)) {
      claimResource(user,url)
      const [kind,id]=resourceKey(url)
      if(kind==='asset' && /^\/uploads\/[a-zA-Z0-9_. -]+$/.test(url) && !['.','..'].includes(url.slice(9))) {
        const file=path.join(MEDIA_ROOT,'uploads',url.slice(9))
        if(fs.existsSync(file) && fs.lstatSync(file).isFile()) db.prepare("UPDATE resources SET bytes=? WHERE kind='asset' AND id=? AND owner=?").run(fs.statSync(file).size,id,user.id)
      }
    }
  }
  audit('local','assign',project)
} else if (command !== 'migrate') throw new Error('Usage: npm run accounts -- init|recover <owner-email> | assign <user-email> <project> | migrate')
