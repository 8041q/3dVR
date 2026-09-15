import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readAssetRegistry } from '../server/assetRegistry.js'
import { sanitizeUploadFilename } from '../server/assetStorage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const projectsRoot = path.join(repoRoot, 'server', 'data', 'projects')
const uploadsRoot = path.join(repoRoot, 'public', 'uploads')
const panoramasRoot = path.join(repoRoot, 'storage', 'panoramas')

function usage() {
  console.log('Usage: npm run export:project -- <project-id> [destination] [--dry-run]')
}

function assertProjectId(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('Invalid project id.')
  return id
}

async function walkJsonFiles(root) {
  const out = []
  const entries = await fs.readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) out.push(...await walkJsonFiles(absolute))
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(absolute)
  }
  return out
}

function collectLocalAssets(value, output) {
  if (Array.isArray(value)) {
    for (const child of value) collectLocalAssets(child, output)
    return
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectLocalAssets(child, output)
    return
  }
  if (typeof value !== 'string') return
  if (value.startsWith('/uploads/') || value.startsWith('/media/panoramas/')) output.add(value)
}

function uniqueBundleName(preferred, used) {
  const safe = sanitizeUploadFilename(preferred || 'asset')
  if (!used.has(safe)) {
    used.add(safe)
    return safe
  }
  const ext = path.extname(safe)
  const stem = safe.slice(0, -ext.length)
  let index = 2
  while (used.has(`${stem}--${index}${ext}`)) index += 1
  const result = `${stem}--${index}${ext}`
  used.add(result)
  return result
}

async function exists(filePath) {
  try { await fs.access(filePath); return true } catch { return false }
}

const args = process.argv.slice(2)
if (!args.length || args.includes('--help') || args.includes('-h')) {
  usage()
  process.exit(args.length ? 0 : 1)
}

const dryRun = args.includes('--dry-run')
const positional = args.filter((arg) => !arg.startsWith('--'))
const projectId = assertProjectId(positional[0])
const sourceProjectDir = path.join(projectsRoot, projectId)
if (!await exists(sourceProjectDir)) throw new Error(`Project not found: ${projectId}`)

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const destination = path.resolve(positional[1] || path.join(repoRoot, 'exports', `${projectId}-${timestamp}`))
const registry = await readAssetRegistry()
const registryByUrl = new Map(registry.assets.map((record) => [record.url, record]))
const refs = new Set()
for (const jsonFile of await walkJsonFiles(sourceProjectDir)) {
  collectLocalAssets(JSON.parse(await fs.readFile(jsonFile, 'utf8')), refs)
}

const uploads = []
const panoramaIds = new Set()
const usedNames = new Set()
for (const url of [...refs].sort()) {
  if (url.startsWith('/uploads/')) {
    const storedName = decodeURIComponent(url.slice('/uploads/'.length))
    if (!storedName || storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
      throw new Error(`Unsafe upload URL in project: ${url}`)
    }
    const source = path.join(uploadsRoot, storedName)
    if (!await exists(source)) throw new Error(`Referenced upload is missing: ${url}`)
    const metadata = registryByUrl.get(url)
    const originalName = metadata?.originalName || storedName
    const bundleName = uniqueBundleName(originalName, usedNames)
    const stat = await fs.stat(source)
    uploads.push({
      url,
      originalName,
      storedName,
      bundlePath: `assets/uploads/${bundleName}`,
      bytes: stat.size,
      contentType: metadata?.contentType || null,
    })
  } else if (url.startsWith('/media/panoramas/')) {
    const assetId = url.slice('/media/panoramas/'.length).split('/')[0]
    if (assetId) panoramaIds.add(assetId)
  }
}

const panoramas = []
for (const assetId of [...panoramaIds].sort()) {
  const source = path.join(panoramasRoot, assetId)
  if (!await exists(source)) throw new Error(`Referenced panorama asset is missing: ${assetId}`)
  panoramas.push({ assetId, bundlePath: `assets/panoramas/${assetId}` })
}

const manifest = {
  schemaVersion: 1,
  kind: '3dvr-project-migration-bundle',
  projectId,
  exportedAt: new Date().toISOString(),
  projectPath: `server/data/projects/${projectId}`,
  uploads,
  panoramas,
}

if (dryRun) {
  console.log(JSON.stringify(manifest, null, 2))
  process.exit(0)
}

await fs.rm(destination, { recursive: true, force: true })
await fs.mkdir(destination, { recursive: true })
await fs.cp(sourceProjectDir, path.join(destination, manifest.projectPath), { recursive: true })
for (const asset of uploads) {
  await fs.mkdir(path.dirname(path.join(destination, asset.bundlePath)), { recursive: true })
  await fs.copyFile(path.join(uploadsRoot, asset.storedName), path.join(destination, asset.bundlePath))
}
for (const panorama of panoramas) {
  await fs.mkdir(path.dirname(path.join(destination, panorama.bundlePath)), { recursive: true })
  await fs.cp(path.join(panoramasRoot, panorama.assetId), path.join(destination, panorama.bundlePath), { recursive: true })
}
await fs.writeFile(path.join(destination, 'migration-manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`Exported ${projectId} to ${destination}`)
console.log(`Uploads: ${uploads.length}; panorama assets: ${panoramas.length}`)
