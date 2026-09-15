import fs from 'node:fs/promises'
import path from 'node:path'

export function sanitizeUploadFilename(filename = 'asset', forcedExtension = '') {
  const base = path.basename(String(filename || 'asset')).normalize('NFKC')
  const sourceExt = path.extname(base).toLowerCase()
  const extension = forcedExtension || sourceExt
  const stemSource = sourceExt ? base.slice(0, -sourceExt.length) : base
  const stem = stemSource
    .replace(/[^a-zA-Z0-9._ -]+/g, '_')
    .replace(/\s+/g, '-')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 120) || 'asset'

  return `${stem}${extension}`
}

export async function chooseStoredFilename(directory, originalName, extension) {
  const preferred = sanitizeUploadFilename(originalName, extension)
  try {
    await fs.access(path.join(directory, preferred))
  } catch (error) {
    if (error.code === 'ENOENT') return preferred
    throw error
  }

  const ext = path.extname(preferred)
  const stem = ext ? preferred.slice(0, -ext.length) : preferred
  for (let suffix = 2; suffix <= 10000; suffix += 1) {
    const candidate = `${stem}-${suffix}${ext}`
    try {
      await fs.access(path.join(directory, candidate))
    } catch (error) {
      if (error.code === 'ENOENT') return candidate
      throw error
    }
  }

  throw new Error('Could not allocate an upload filename.')
}
