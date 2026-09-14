import * as THREE from 'three'
const DEFAULT_BUDGET = 192 * 1024 * 1024
function estimate(texture) { const i = texture?.image; const w = Number(i?.naturalWidth || i?.width || 0); const h = Number(i?.naturalHeight || i?.height || 0); return w*h*4 }
export class TextureLRU {
  constructor({ maxBytes = DEFAULT_BUDGET, maxConcurrent = 6 } = {}) { this.maxBytes=maxBytes; this.maxConcurrent=maxConcurrent; this.entries=new Map(); this.queue=[]; this.active=0; this.totalBytes=0; this.loader=new THREE.TextureLoader() }
  setBudget(value) { this.maxBytes=Math.max(32*1024*1024, Number(value)||this.maxBytes); this.evict() }
  acquire(url) {
    let e=this.entries.get(url); if (e) { e.pins++; e.lastUsed=performance.now(); return e.promise }
    let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b}); e={url,pins:1,lastUsed:performance.now(),state:'queued',promise,resolve,reject,texture:null,bytes:0}; this.entries.set(url,e); this.queue.push(e); this.pump(); return promise
  }
  release(url) { const e=this.entries.get(url); if (!e) return; e.pins=Math.max(0,e.pins-1); e.lastUsed=performance.now(); this.evict() }
  pump() { while (this.active < this.maxConcurrent && this.queue.length) { const e=this.queue.shift(); if (!e || e.state!=='queued') continue; e.state='loading'; this.active++; this.loader.load(e.url, (texture)=>{this.active--; texture.colorSpace=THREE.SRGBColorSpace; texture.generateMipmaps=false; texture.minFilter=THREE.LinearFilter; texture.magFilter=THREE.LinearFilter; e.texture=texture; e.bytes=estimate(texture); e.state='ready'; e.lastUsed=performance.now(); this.totalBytes+=e.bytes; e.resolve(texture); this.evict(); this.pump()}, undefined, (error)=>{this.active--; e.state='error'; e.reject(error); this.entries.delete(e.url); this.pump()}) } }
  evict() { if (this.totalBytes<=this.maxBytes) return; const candidates=[...this.entries.values()].filter((e)=>e.state==='ready'&&e.pins===0).sort((a,b)=>a.lastUsed-b.lastUsed); for (const e of candidates) { if (this.totalBytes<=this.maxBytes) break; e.texture?.dispose(); this.totalBytes-=e.bytes; this.entries.delete(e.url) } }
  stats() { return { entries:this.entries.size,totalBytes:this.totalBytes,maxBytes:this.maxBytes,active:this.active,queued:this.queue.length } }
  clear() { for (const e of this.entries.values()) e.texture?.dispose(); this.entries.clear(); this.queue=[]; this.totalBytes=0 }
}
export const panoramaTextureCache = new TextureLRU()
