import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { PANORAMA_ROOT, WORK_ROOT } from './storagePaths.js'

export const DEFAULT_TILE_SIZE = 512
export const DEFAULT_WEBP_QUALITY = 94

const FACES = [
  { id: 'front', yaw: 0, pitch: 0, roll: 0 },
  { id: 'right', yaw: 90, pitch: 0, roll: 0 },
  { id: 'back', yaw: 180, pitch: 0, roll: 0 },
  { id: 'left', yaw: -90, pitch: 0, roll: 0 },
  { id: 'up', yaw: 0, pitch: 90, roll: 0 },
  { id: 'down', yaw: 0, pitch: -90, roll: 0 },
]

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => { stdout += c.toString() })
    child.stderr.on('data', (c) => { stderr += c.toString() })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} exited ${code}\n${stderr.trim()}`)))
  })
}

export async function assertPanoramaProcessorAvailable() {
  const result = await run('ffmpeg', ['-hide_banner', '-filters'])
  if (!/\bv360\b/.test(`${result.stdout}\n${result.stderr}`)) throw new Error('FFmpeg v360 filter is unavailable.')
}

export function buildPyramidLevels(sourceWidth, tileSize = DEFAULT_TILE_SIZE) {
  const nativeFaceSize = Math.max(tileSize, Math.floor(Number(sourceWidth) / 4))
  const processedFaceSize = Math.max(tileSize, Math.ceil(nativeFaceSize / tileSize) * tileSize)
  const levels = []
  let faceSize = tileSize
  let id = 0
  while (faceSize < processedFaceSize) {
    levels.push({ id, faceSize, tilesPerEdge: faceSize / tileSize })
    id += 1
    faceSize *= 2
  }
  if (!levels.length || levels.at(-1).faceSize !== processedFaceSize) {
    levels.push({ id, faceSize: processedFaceSize, tilesPerEdge: processedFaceSize / tileSize })
  }
  return { nativeFaceSize, processedFaceSize, levels }
}

function tileFilter(face, level, tileSize) {
  const count = level.tilesPerEdge ** 2
  return [
    `v360=input=equirect:output=flat:yaw=${face.yaw}:pitch=${face.pitch}:roll=${face.roll}:h_fov=90:v_fov=90:w=${level.faceSize}:h=${level.faceSize}:interp=lanczos`,
    `loop=loop=${Math.max(0, count - 1)}:size=1:start=0`,
    `crop=${tileSize}:${tileSize}:x='mod(n\\,${level.tilesPerEdge})*${tileSize}':y='floor(n/${level.tilesPerEdge})*${tileSize}'`,
  ].join(',')
}

async function renderFaceLevel({ sourcePath, destination, face, level, tileSize, quality }) {
  await fs.mkdir(destination, { recursive: true })
  const count = level.tilesPerEdge ** 2
  const pattern = path.join(destination, 'tile_%05d.webp')
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath,
    '-vf', tileFilter(face, level, tileSize),
    '-frames:v', String(count), '-start_number', '0', '-an',
    '-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6', '-preset', 'picture', pattern,
  ])
  for (let i = 0; i < count; i += 1) {
    const col = i % level.tilesPerEdge
    const row = Math.floor(i / level.tilesPerEdge)
    await fs.rename(path.join(destination, `tile_${String(i).padStart(5, '0')}.webp`), path.join(destination, `${col}_${row}.webp`))
  }
}

async function sha256File(file) {
  const hash = crypto.createHash('sha256')
  await new Promise((resolve, reject) => {
    const s = createReadStream(file)
    s.on('data', (c) => hash.update(c)); s.on('end', resolve); s.on('error', reject)
  })
  return hash.digest('hex')
}

async function buildIndex(outputRoot, assetId, revision, levels) {
  const files = []
  for (const level of levels) for (const face of FACES) for (let row = 0; row < level.tilesPerEdge; row += 1) for (let col = 0; col < level.tilesPerEdge; col += 1) {
    const relative = path.posix.join('levels', String(level.id), face.id, `${col}_${row}.webp`)
    const absolute = path.join(outputRoot, relative)
    const stat = await fs.stat(absolute)
    files.push({ url: `/media/panoramas/${assetId}/${relative}`, bytes: stat.size, sha256: await sha256File(absolute) })
  }
  return { schemaVersion: 1, assetId, revision, files }
}

function manifestFor({ job, assetId, revision, tileSize, quality, levelInfo }) {
  const base = `/media/panoramas/${assetId}`
  return {
    schemaVersion: 1,
    id: assetId,
    revision,
    kind: 'multires-cubemap',
    projection: 'cubemap-multires',
    source: { projection: 'equirectangular', width: job.source.width, height: job.source.height, format: job.source.format, byteSize: job.source.byteSize, filename: job.source.filename },
    encoding: { format: 'webp', quality, colorSpace: 'srgb' },
    tileSize,
    nativeFaceSize: levelInfo.nativeFaceSize,
    processedFaceSize: levelInfo.processedFaceSize,
    faces: FACES,
    baseLevel: levelInfo.levels[0].id,
    maxLevel: levelInfo.levels.at(-1).id,
    levels: levelInfo.levels.map((level) => ({ ...level, tileCount: level.tilesPerEdge ** 2 * FACES.length, tileUrlTemplate: `${base}/levels/${level.id}/{face}/{col}_{row}.webp` })),
    assetIndexUrl: `${base}/asset-index.json`,
    createdAt: new Date().toISOString(),
  }
}

export async function processPanoramaJob(job, onProgress = async () => {}) {
  if (!job?.source?.storagePath) throw new Error('Invalid panorama job.')
  await assertPanoramaProcessorAvailable()
  const tileSize = Number(job.output?.tileSize) || DEFAULT_TILE_SIZE
  const quality = Math.max(1, Math.min(100, Number(job.output?.quality || DEFAULT_WEBP_QUALITY)))
  const levelInfo = buildPyramidLevels(job.source.width, tileSize)
  const assetId = job.output?.assetId || job.source.uploadId || job.id
  const revision = job.id
  const finalRoot = path.join(PANORAMA_ROOT, assetId)
  const workRoot = path.join(WORK_ROOT, `.processing-${job.id}`)
  await fs.mkdir(PANORAMA_ROOT, { recursive: true }); await fs.mkdir(WORK_ROOT, { recursive: true })
  await fs.rm(workRoot, { recursive: true, force: true }); await fs.mkdir(workRoot, { recursive: true })
  const totalSteps = levelInfo.levels.length * FACES.length
  let completedSteps = 0
  try {
    for (const level of levelInfo.levels) for (const face of FACES) {
      await onProgress({ stage: 'rendering', completedSteps, totalSteps, level: level.id, face: face.id, percent: completedSteps / totalSteps })
      await renderFaceLevel({ sourcePath: job.source.storagePath, destination: path.join(workRoot, 'levels', String(level.id), face.id), face, level, tileSize, quality })
      completedSteps += 1
    }
    const manifest = manifestFor({ job, assetId, revision, tileSize, quality, levelInfo })
    const index = await buildIndex(workRoot, assetId, revision, levelInfo.levels)
    await fs.writeFile(path.join(workRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))
    await fs.writeFile(path.join(workRoot, 'asset-index.json'), JSON.stringify(index, null, 2))
    await fs.rm(finalRoot, { recursive: true, force: true })
    await fs.rename(workRoot, finalRoot)
    return { assetId, revision, manifestUrl: `${manifest.levels[0].tileUrlTemplate.split('/levels/')[0]}/manifest.json`, assetIndexUrl: manifest.assetIndexUrl, outputPath: finalRoot }
  } catch (error) {
    await fs.rm(workRoot, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}
