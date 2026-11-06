export function activationToken(value) {
  const input=String(value || '').trim()
  if (/^[a-f0-9]{64}$/i.test(input)) return input
  try {
    const url=new URL(input)
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) return null
    const token=new URLSearchParams(url.hash.slice(1)).get('invite')
    return /^[a-f0-9]{64}$/i.test(token || '') ? token : null
  } catch { return null }
}
export function safeReturnPath(value) {
  return typeof value==='string' && /^\/(?:v|editor)\/[a-z0-9][a-z0-9-]{0,63}$/.test(value) ? value : null
}
