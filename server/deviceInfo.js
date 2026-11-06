import { isIP } from 'node:net'
import { fileURLToPath } from 'node:url'
import { open } from 'maxmind'

let reader
export function normalizedIp(value) {
  const ip=String(value || '').replace(/^::ffff:/i,'').split('%')[0]
  return isIP(ip) ? ip : ''
}
export async function approximateLocation(value) {
  const ip=normalizedIp(value)
  if(!ip) return 'Location unavailable'
  if(/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) || ip==='::1' || /^(fc|fd|fe[89ab])/i.test(ip)) return 'Local network'
  reader ||= open(process.env.GEOIP_DATABASE || fileURLToPath(new URL('../node_modules/@ip-location-db/dbip-country-mmdb/dbip-country.mmdb',import.meta.url))).catch(()=>null)
  const record=(await reader)?.get(ip)
  const country=typeof record==='string' ? record : record?.country_code || record?.country?.iso_code || record?.registered_country?.iso_code
  const name=country && /^[A-Z]{2}$/.test(country) ? new Intl.DisplayNames(['en'],{type:'region'}).of(country) : null
  const city=record?.city?.names?.en || (typeof record?.city==='string' ? record.city : '')
  return [city,name].filter(Boolean).join(', ') || 'Location unavailable'
}
export function deviceName(agent='') {
  const os=/Android/i.test(agent)?'Android':/iPhone|iPad|iPod/i.test(agent)?'iOS':/Windows/i.test(agent)?'Windows':/Macintosh|Mac OS X/i.test(agent)?'macOS':/Linux/i.test(agent)?'Linux':'Unknown system'
  const browser=/Edg\//i.test(agent)?'Edge':/Firefox\//i.test(agent)?'Firefox':/Chrome\//i.test(agent)?'Chrome':/Safari\//i.test(agent)?'Safari':'Unknown browser'
  return `${browser} on ${os}`
}
