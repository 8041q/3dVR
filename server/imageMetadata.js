import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const timer = setTimeout(() => child.kill('SIGKILL'), 30000)
    child.once('close', () => clearTimeout(timer))
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(-1048576) })
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-1048576) })
    child.on('error', reject)
    child.on('close', (code) => code === 0
      ? resolve(stdout)
      : reject(new Error(`${command} failed (${code}) ${stderr.trim()}`)))
  })
}

export async function readImageMetadata(filePath) {
  const handle=await fs.open(filePath,'r'), header=Buffer.alloc(16)
  try {await handle.read(header,0,16,0)} finally {await handle.close()}
  const hex=header.toString('hex'), text=header.toString('ascii')
  if (!hex.startsWith('ffd8ff') && !hex.startsWith('89504e470d0a1a0a') && !(text.startsWith('RIFF') && text.slice(8,12)==='WEBP')) throw Object.assign(new Error('Use a JPEG, PNG or WebP image.'),{status:415})
  const output = await run('ffprobe', [
    '-v', 'error', '-protocol_whitelist', 'file',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,codec_name',
    '-of', 'json',
    filePath,
  ])
  const parsed = JSON.parse(output)
  const stream = parsed.streams?.[0]
  if (!stream?.width || !stream?.height) throw new Error('Could not read image dimensions.')
  const formatMap = { mjpeg: 'jpeg', png: 'png', webp: 'webp' }
  return {
    width: Number(stream.width),
    height: Number(stream.height),
    format: formatMap[stream.codec_name] || stream.codec_name || 'unknown',
  }
}

export function validateEquirectangular(metadata, tolerance = 0.015) {
  if (!['jpeg','png','webp'].includes(metadata.format) || metadata.width > 32768 || metadata.height > 16384) return { valid:false, reason:'Use a JPEG, PNG or WebP panorama up to 32768 by 16384 pixels.' }
  const ratio = metadata.width / metadata.height
  const valid = Math.abs(ratio - 2) <= tolerance
  return {
    valid,
    ratio,
    reason: valid ? null : `Expected an approximately 2:1 equirectangular image, got ${metadata.width}×${metadata.height} (${ratio.toFixed(4)}:1).`,
  }
}
