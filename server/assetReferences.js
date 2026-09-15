import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_ROOT = path.join(__dirname, 'data')
const PROJECTS_ROOT = path.join(DATA_ROOT, 'projects')
const LEGACY_FILES = [
  ['scenes.json', 'legacy-scenes'],
  ['guides.json', 'legacy-guides'],
]

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function collectJsonFiles(directory) {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const output = []
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) output.push(...await collectJsonFiles(absolute))
    else if (entry.isFile() && entry.name.endsWith('.json')) output.push(absolute)
  }
  return output
}

function findExactStringPaths(value, target, currentPath = '$', output = []) {
  if (typeof value === 'string') {
    if (value === target) output.push(currentPath)
    return output
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => findExactStringPaths(item, target, `${currentPath}[${index}]`, output))
    return output
  }

  if (!value || typeof value !== 'object') return output

  for (const [key, child] of Object.entries(value)) {
    const safeKey = /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`
    findExactStringPaths(child, target, `${currentPath}${safeKey}`, output)
  }
  return output
}

function projectReferenceInfo(filePath, paths) {
  const relative = path.relative(DATA_ROOT, filePath).split(path.sep).join('/')
  const parts = relative.split('/')
  const projectId = parts[0] === 'projects' ? parts[1] : null
  const filename = parts.at(-1)
  let kind = 'project-data'
  let revision = null

  if (filename === 'draft.json') kind = 'draft'
  else if (filename === 'published.json') kind = 'published'
  else if (parts.includes('versions')) {
    kind = 'version'
    revision = path.basename(filename, '.json')
  } else if (filename === 'meta.json') kind = 'meta'

  return { file: relative, projectId, kind, revision, paths }
}

export async function findAssetReferences(assetUrl) {
  const target = String(assetUrl || '').trim()
  if (!target) return []

  const references = []
  const projectFiles = await collectJsonFiles(PROJECTS_ROOT)

  for (const filePath of projectFiles) {
    const value = await readJson(filePath)
    if (value == null) continue
    const paths = findExactStringPaths(value, target)
    if (paths.length) references.push(projectReferenceInfo(filePath, paths))
  }

  for (const [filename, kind] of LEGACY_FILES) {
    const filePath = path.join(DATA_ROOT, filename)
    const value = await readJson(filePath)
    if (value == null) continue
    const paths = findExactStringPaths(value, target)
    if (paths.length) {
      references.push({
        file: filename,
        projectId: null,
        kind,
        revision: null,
        paths,
      })
    }
  }

  return references
}
