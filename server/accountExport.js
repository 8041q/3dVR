import fs from 'node:fs/promises'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import yazl from 'yazl'
import { createProjectBundleService } from './projectBundles.js'
import { securityDb } from './identity.js'
import { MEDIA_ROOT, PANORAMA_ROOT, MASTER_ROOT } from './storagePaths.js'
import { safeStoredPath, storedFiles } from './accountFiles.js'
import { accountProjects } from './projectOwnership.js'

export async function prepareAccountExport(userId) {
  const service=createProjectBundleService(), projects=[]
  for(const grant of accountProjects(securityDb(),userId)) projects.push({id:grant.project,plan:await service.prepareExport(grant.project)})
  const files=[], seen=new Set()
  const append=(file,name)=>{if(!seen.has(name)){seen.add(name);files.push({file,name})}}
  for(const resource of securityDb().prepare('SELECT * FROM resources WHERE owner=?').all(userId)) {
    if(resource.kind==='asset' && resource.id.startsWith('/uploads/')) {
      const relative=decodeURIComponent(resource.id.slice('/uploads/'.length)), root=path.join(MEDIA_ROOT,'uploads')
      const file=await safeStoredPath(root,relative)
      if(file && (await fs.stat(file)).isFile()) append(file,'assets/uploads/'+relative.split(path.sep).join('/'))
    } else if(resource.kind==='panorama' && /^[a-zA-Z0-9-]{1,100}$/.test(resource.id)) {
      for(const item of await storedFiles(PANORAMA_ROOT,resource.id)) append(item.file,'assets/panoramas/'+item.relative)
      for(const name of await fs.readdir(MASTER_ROOT).catch(()=>[])) if(name.startsWith(resource.id+'.')) {
        const file=await safeStoredPath(MASTER_ROOT,name)
        if(file && (await fs.stat(file)).isFile()) append(file,'assets/panorama-masters/'+name)
      }
    }
    if(files.length>200000) throw Object.assign(new Error('This account export contains too many files.'),{status:413})
  }
  return {service,projects,files,filename:'atria-account-projects.zip'}
}
export async function writeAccountExport(bundle,output) {
  const zip=new yazl.ZipFile(), active=new Set()
  zip.on('error',error=>zip.outputStream.destroy(error))
  const writing=pipeline(zip.outputStream,output)
  try {
    zip.addBuffer(Buffer.from(JSON.stringify({kind:'3dvr-account-projects',schemaVersion:1,exportedAt:new Date().toISOString(),projects:bundle.projects.map(project=>({id:project.id,archive:`projects/${project.id}.3dvr.zip`,externalAssets:project.plan.externalAssets})),additionalAssets:bundle.files.map(file=>file.name)},null,2)),'account-export.json')
    for(const project of bundle.projects) zip.addReadStreamLazy(`projects/${project.id}.3dvr.zip`,{compress:false},callback=> {
      const stream=new PassThrough()
      active.add(stream);stream.once('close',()=>active.delete(stream))
      callback(null,stream)
      bundle.service.writeExport(project.plan,stream).catch(error=>stream.destroy(error))
    })
    for(const file of bundle.files) zip.addFile(file.file,file.name,{compress:false})
    zip.end()
    await writing
  } catch(error) {zip.outputStream.destroy(error);await writing.catch(()=>{});throw error}
  finally {for(const stream of active) stream.destroy()}
}
