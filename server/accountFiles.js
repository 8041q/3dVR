import fs from 'node:fs/promises'
import path from 'node:path'

export function containedPath(root, relative) {
  const target=path.resolve(root,relative), inside=path.relative(path.resolve(root),target)
  if(!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error('Account file path is outside its storage directory.')
  return target
}
export async function safeStoredPath(root, relative) {
  const target=containedPath(root,relative)
  const real=await fs.realpath(target).catch(error=>{if(error.code==='ENOENT')return null;throw error})
  if(!real) return null
  const base=await fs.realpath(root), inside=path.relative(base,real)
  if(!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error('Account file resolves outside its storage directory.')
  return target
}
export async function removeStoredPath(root, relative) {
  const target=await safeStoredPath(root,relative)
  if(target) await fs.rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:100})
}
export async function storedFiles(root, relative='') {
  const directory=relative ? await safeStoredPath(root,relative) : root
  if(!directory) return []
  const entries=await fs.readdir(directory,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error})
  const result=[]
  for(const entry of entries) {
    if(entry.isSymbolicLink()) throw new Error('Symbolic links are not included in account files.')
    const name=relative ? path.join(relative,entry.name) : entry.name
    if(entry.isDirectory()) result.push(...await storedFiles(root,name))
    else if(entry.isFile()) result.push({file:containedPath(root,name),relative:name.split(path.sep).join('/')})
  }
  return result
}
