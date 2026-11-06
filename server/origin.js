import { networkInterfaces } from 'node:os'
// Never derive trusted origins from request headers. Development, activation
// links and cookie settings must agree on the same explicitly configured URL.
export function applicationOrigin(env = process.env) {
  const fallback = `${env.VITE_DEV_HTTPS === '1' ? 'https' : 'http'}://localhost:5173`
  const url = new URL(env.APP_ORIGIN || fallback)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*')) {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path, credentials, query or fragment.')
  }
  return url.origin
}

// Development hosts come from current OS interfaces, not a saved IP list.
export function machineOrigins(base, interfaces = networkInterfaces()) {
  const origins=new Set()
  const addresses=Object.values(interfaces).flat().filter(Boolean).map(item=>item.address)
  for(const address of ['localhost','127.0.0.1','::1',...addresses]) {
    if(address.includes('%')) continue
    const candidate=new URL(base)
    candidate.hostname=address.includes(':') ? `[${address}]` : address
    origins.add(candidate.origin)
  }
  return [...origins]
}
export function developmentEnvironment(env = process.env, forceHttps = false) {
  const url=new URL(applicationOrigin(env))
  if(forceHttps) url.protocol='https:'
  return {APP_ORIGIN:url.origin,APP_DYNAMIC_HOSTS:'1',VITE_DEV_HTTPS:url.protocol==='https:' ? '1' : '0'}
}
export function trustedApplicationOrigins(env = process.env, interfaces = networkInterfaces()) {
  const primary=applicationOrigin(env)
  const origins=[primary]
  for(const value of (env.APP_TRUSTED_ORIGINS || '').split(',').filter(Boolean)) origins.push(applicationOrigin({...env,APP_ORIGIN:value.trim()}))
  // Configured public names survive server IP changes; never infer names from Host/X-Forwarded-Host.
  for(const value of (env.APP_PUBLIC_HOSTS || '').split(',').filter(Boolean)) origins.push(applicationOrigin({...env,APP_ORIGIN:new URL(primary).protocol+'//'+value.trim()}))
  if(env.APP_DYNAMIC_HOSTS!=='0') origins.push(...machineOrigins(primary,interfaces))
  if(env.NODE_ENV==='production' && origins.some(origin=>!origin.startsWith('https:'))) throw new Error('Production trusted origins must use HTTPS.')
  return [...new Set(origins)]
}
