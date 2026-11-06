import fs from 'node:fs/promises'
import path from 'node:path'
import { INCOMING_ROOT } from './storagePaths.js'
import { securityDb } from './identity.js'
export async function cleanupAbandonedUploads(now=Date.now()) {
  await fs.mkdir(INCOMING_ROOT,{recursive:true})
  for (const entry of await fs.readdir(INCOMING_ROOT,{withFileTypes:true})) {
    const target=path.join(INCOMING_ROOT,entry.name)
    const stat=await fs.stat(target).catch(()=>null)
    if (!stat || now-stat.mtimeMs<86400000) continue
    if (entry.isDirectory() && entry.name.startsWith('project-')) await fs.rm(target,{recursive:true,force:true})
    if (entry.isFile() && /^[0-9a-f-]{36}\.json$/i.test(entry.name)) {
      const upload=JSON.parse(await fs.readFile(target,'utf8').catch(()=>'{}'))
      if(upload.status!=='uploading' || upload.finalization) continue
      await fs.rm(path.join(INCOMING_ROOT,entry.name.replace('.json','.part')),{force:true})
      await fs.rm(target,{force:true})
      securityDb().prepare("DELETE FROM resources WHERE kind='panorama' AND id=?").run(entry.name.slice(0,-5))
    }
  }
}
