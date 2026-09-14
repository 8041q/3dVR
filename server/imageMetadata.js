import { spawn } from 'node:child_process'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => code === 0
      ? resolve(stdout)
      : reject(new Error(`${command} failed (${code}) ${stderr.trim()}`)))
  })
}

export async function readImageMetadata(filePath) {
  const output = await run('ffprobe', [
    '-v', 'error',
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
  const ratio = metadata.width / metadata.height
  const valid = Math.abs(ratio - 2) <= tolerance
  return {
    valid,
    ratio,
    reason: valid ? null : `Expected an approximately 2:1 equirectangular image, got ${metadata.width}×${metadata.height} (${ratio.toFixed(4)}:1).`,
  }
}
