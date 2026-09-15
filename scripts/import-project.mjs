import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readAssetRegistry, registerAsset } from '../server/assetRegistry.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const projectsRoot = path.join(repoRoot, 'server', 'data', 'projects')
const uploadsRoot = path.join(repoRoot, 'public', 'uploads')
const panoramasRoot = path.join(repoRoot, 'storage', 'panoramas')

function usage() {
  console.log('Usage: npm run import:project -- <bundle-directory> [--overwrite] [--dry-run]')
}

async function exists(filePath) {
  try { await fs.access(filePath); return true } catch { return false }
}

const args = process.argv.slice(2)
if (!args.length || args.includes('--help') || args.includes('-h')) {
  usage()
  process.exit(args.length ? 0 : 1)
}
const overwrite = args.includes('--overwrite')
const dryRun = args.includes('--dry-run')
const positional = args.filter((arg) => !arg.startsWith('--'))
const bundleRoot = path.resolve(positional[0])
const manifestPath = path.join(bundleRoot, 'migration-manifest.json')
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
if (manifest.kind !== '3dvr-project-migration-bundle' || Number(manifest.schemaVersion) !== 1) {
  throw new Error('Unsupported 3DVR migration bundle.')
}
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(manifest.projectId || ''))) {
  throw new Error('Migration bundle contains an invalid project id.')
}

const targetProject = path.join(projectsRoot, manifest.projectId)
const sourceProject = path.join(bundleRoot, manifest.projectPath)
if (!await exists(sourceProject)) throw new Error('Migration bundle project data is missing.')
if (await exists(targetProject) && !overwrite) {
  throw new Error(`Project ${manifest.projectId} already exists. Re-run with --overwrite to replace it.`)
}

for (const asset of manifest.uploads || []) {
  if (!asset.storedName || path.basename(asset.storedName) !== asset.storedName) throw new Error('Unsafe stored upload name in bundle.')
  if (!await exists(path.join(bundleRoot, asset.bundlePath))) throw new Error(`Bundle upload is missing: ${asset.bundlePath}`)
}
for (const panorama of manifest.panoramas || []) {
  if (!/^[a-zA-Z0-9._-]+$/.test(String(panorama.assetId || ''))) throw new Error('Unsafe panorama id in bundle.')
  if (!await exists(path.join(bundleRoot, panorama.bundlePath))) throw new Error(`Bundle panorama is missing: ${panorama.bundlePath}`)
}

if (dryRun) {
  const currentRegistry = await readAssetRegistry()
  console.log(JSON.stringify({
    projectId: manifest.projectId,
    overwriteRequired: await exists(targetProject),
    uploads: (manifest.uploads || []).length,
    panoramas: (manifest.panoramas || []).length,
    existingRegistryEntries: currentRegistry.assets.length,
  }, null, 2))
  process.exit(0)
}

await fs.mkdir(projectsRoot, { recursive: true })
if (overwrite) await fs.rm(targetProject, { recursive: true, force: true })
await fs.cp(sourceProject, targetProject, { recursive: true })
await fs.mkdir(uploadsRoot, { recursive: true })
for (const asset of manifest.uploads || []) {
  const destination = path.join(uploadsRoot, asset.storedName)
  if (await exists(destination) && !overwrite) throw new Error(`Upload already exists: ${asset.storedName}`)
  await fs.copyFile(path.join(bundleRoot, asset.bundlePath), destination)
  await registerAsset({
    url: asset.url,
    originalName: asset.originalName || asset.storedName,
    storedName: asset.storedName,
    bytes: asset.bytes,
    contentType: asset.contentType || 'application/octet-stream',
    importedAt: new Date().toISOString(),
  })
}
await fs.mkdir(panoramasRoot, { recursive: true })
for (const panorama of manifest.panoramas || []) {
  const destination = path.join(panoramasRoot, panorama.assetId)
  if (overwrite) await fs.rm(destination, { recursive: true, force: true })
  await fs.cp(path.join(bundleRoot, panorama.bundlePath), destination, { recursive: true, force: overwrite })
}
console.log(`Imported project ${manifest.projectId}.`)
