import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const pending = new Map()
let running = 0
const waiting = []

export function imageAssetPath(url, publicRoot) {
  let decoded
  try { decoded = decodeURIComponent(String(url || '')) } catch { return null }
  if (!/^\/(uploads|demo)\//.test(decoded) || decoded.includes('\\') || decoded.includes('\0')) return null
  const target = path.resolve(publicRoot, `.${decoded}`)
  const directory = path.join(publicRoot, decoded.startsWith('/uploads/') ? 'uploads' : 'demo')
  const relative = path.relative(directory, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(target).toLowerCase())) return null
  return target
}

export async function assetThumbnail(url, publicRoot, cacheRoot) {
  const target = imageAssetPath(url, publicRoot)
  if (!target) return null
  const real = await fs.realpath(target)
  const roots = await Promise.all(['uploads', 'demo'].map((name) => fs.realpath(path.join(publicRoot, name)).catch(() => null)))
  if (!roots.some((root) => { const relative = root && path.relative(root, real); return root && relative && !relative.startsWith('..') && !path.isAbsolute(relative) })) return null
  const stat = await fs.stat(real)
  if (!stat.isFile()) return null
  const key = crypto.createHash('sha256').update(`${real}:${stat.size}:${stat.mtimeMs}`).digest('hex')
  const output = path.join(cacheRoot, `${key}.webp`)
  if (await fs.stat(output).then(() => true).catch(() => false)) return output
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      if (running >= 2) await new Promise((resolve) => waiting.push(resolve))
      running += 1
      const temporary = path.join(cacheRoot, `${key}.part.webp`)
      try {
        await fs.mkdir(cacheRoot, { recursive: true })
        await execute('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '1', '-i', real, '-vf', 'scale=480:320:force_original_aspect_ratio=decrease', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '75', '-threads', '1', temporary], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 })
        await fs.rename(temporary, output)
        return output
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => {})
        running -= 1
        waiting.shift()?.()
      }
    })().finally(() => pending.delete(key)))
  }
  return pending.get(key)
}
