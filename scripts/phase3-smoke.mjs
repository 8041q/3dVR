import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const scratch = path.join(repoRoot, '.phase3-smoke')
const storage = path.join(scratch, 'storage')
const source = path.join(scratch, 'source.png')

process.env.VR_STORAGE_ROOT = storage

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} failed (${code})\n${stderr}`))
    })
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function sha256(filePath) {
  const data = await fs.readFile(filePath)
  return crypto.createHash('sha256').update(data).digest('hex')
}

await fs.rm(scratch, { recursive: true, force: true })
await fs.mkdir(scratch, { recursive: true })

const filterOutput = await new Promise((resolve, reject) => {
  const child = spawn('ffmpeg', ['-hide_banner', '-filters'])
  let text = ''
  child.stdout.on('data', (chunk) => { text += chunk.toString() })
  child.stderr.on('data', (chunk) => { text += chunk.toString() })
  child.on('error', reject)
  child.on('close', (code) => code === 0 ? resolve(text) : reject(new Error('ffmpeg -filters failed')))
})
assert(/\bv360\b/.test(filterOutput), 'FFmpeg v360 filter is missing')

await run('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'color=c=0x203040:s=4096x2048:d=1',
  '-frames:v', '1', source,
])

const { processPanoramaJob, buildPyramidLevels } = await import(
  pathToFileURL(path.join(repoRoot, 'server', 'panoramaProcessor.js')).href
)

const levelInfo = buildPyramidLevels(4096, 512)
assert(levelInfo.levels.length === 2, `expected 2 levels, got ${levelInfo.levels.length}`)

const job = {
  id: crypto.randomUUID(),
  type: 'panorama-pyramid',
  source: {
    uploadId: crypto.randomUUID(),
    filename: 'source.png',
    storagePath: source,
    byteSize: (await fs.stat(source)).size,
    width: 4096,
    height: 2048,
    format: 'png',
  },
  output: { tileSize: 512, quality: 86 },
}

const result = await processPanoramaJob(job)
const manifest = JSON.parse(await fs.readFile(path.join(result.outputPath, 'manifest.json'), 'utf8'))
const index = JSON.parse(await fs.readFile(path.join(result.outputPath, 'asset-index.json'), 'utf8'))

assert(manifest.kind === 'multires-cubemap', 'wrong manifest kind')
assert(index.files.length === 30, `expected 30 tiles, got ${index.files.length}`)

for (const file of index.files) {
  const relative = file.url.split(`/media/panoramas/${result.assetId}/`)[1]
  assert(relative, `could not derive tile path for ${file.url}`)
  const tilePath = path.join(result.outputPath, relative)
  const stat = await fs.stat(tilePath)
  assert(stat.size === file.bytes, `size mismatch for ${relative}`)
  assert(await sha256(tilePath) === file.sha256, `hash mismatch for ${relative}`)
}

console.log('[phase3] PASS - panorama pyramid and 30 tile hashes verified')
