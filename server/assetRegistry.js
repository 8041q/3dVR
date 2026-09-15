import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ASSET_REGISTRY_PATH = path.join(__dirname, 'data', 'assets.json')

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(temp, JSON.stringify(value, null, 2))
  await fs.rename(temp, filePath)
}

export async function readAssetRegistry() {
  const value = await readJson(ASSET_REGISTRY_PATH, { schemaVersion: 1, assets: [] })
  return {
    schemaVersion: 1,
    assets: Array.isArray(value?.assets) ? value.assets : [],
  }
}

export async function registerAsset(record) {
  const registry = await readAssetRegistry()
  const url = String(record?.url || '').trim()
  if (!url) throw new Error('Asset registry record requires a URL.')

  const next = {
    ...record,
    url,
    originalName: String(record.originalName || record.storedName || '').trim(),
    storedName: String(record.storedName || '').trim(),
  }
  const index = registry.assets.findIndex((asset) => asset.url === url)
  if (index >= 0) registry.assets[index] = { ...registry.assets[index], ...next }
  else registry.assets.push(next)

  registry.assets.sort((a, b) => String(a.url).localeCompare(String(b.url)))
  await writeJsonAtomic(ASSET_REGISTRY_PATH, registry)
  return next
}

export async function removeAssetFromRegistry(url) {
  const target = String(url || '').trim()
  if (!target) return null

  const registry = await readAssetRegistry()
  const index = registry.assets.findIndex((asset) => asset.url === target)
  if (index < 0) return null

  const [removed] = registry.assets.splice(index, 1)
  await writeJsonAtomic(ASSET_REGISTRY_PATH, registry)
  return removed
}

export async function assetRegistryByUrl() {
  const registry = await readAssetRegistry()
  return new Map(registry.assets.map((record) => [record.url, record]))
}
