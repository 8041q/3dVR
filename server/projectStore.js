import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_ROOT = path.join(__dirname, 'data')
const PROJECTS_ROOT = path.join(DATA_ROOT, 'projects')
const LEGACY_SCENES_PATH = path.join(DATA_ROOT, 'scenes.json')
const LEGACY_GUIDES_PATH = path.join(DATA_ROOT, 'guides.json')

const ASSET_KEYS = new Set([
  'src',
  'image',
  'imageUrl',
  'video',
  'videoUrl',
  'audio',
  'audioUrl',
  'narrationUrl',
  'model',
  'modelUrl',
  'icon',
  'iconUrl',
  'thumbnail',
  'manifestUrl',
])

function nowIso() {
  return new Date().toISOString()
}

function projectDir(projectId) {
  return path.join(PROJECTS_ROOT, projectId)
}

function metaPath(projectId) {
  return path.join(projectDir(projectId), 'meta.json')
}

function draftPath(projectId) {
  return path.join(projectDir(projectId), 'draft.json')
}

function publishedPath(projectId) {
  return path.join(projectDir(projectId), 'published.json')
}

function versionsDir(projectId) {
  return path.join(projectDir(projectId), 'versions')
}

function versionPath(projectId, revision) {
  return path.join(versionsDir(projectId), `${revision}.json`)
}

function sanitizeProjectId(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(normalized)) {
    const error = new Error('Invalid project id')
    error.status = 400
    throw error
  }
  return normalized
}

function slugify(value) {
  return String(value || 'project')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52) || 'project'
}

async function readJson(filePath, fallback = null) {
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

function collectAssets(value, assets) {
  if (Array.isArray(value)) {
    for (const item of value) collectAssets(item, assets)
    return
  }

  if (!value || typeof value !== 'object') return

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && ASSET_KEYS.has(key) && child.trim()) {
      assets.add(child.trim())
    } else {
      collectAssets(child, assets)
    }
  }
}

function normalizeSnapshot(projectId, value = {}) {
  const scenes = Array.isArray(value.scenes) ? value.scenes : []
  const guides = Array.isArray(value.guides) ? value.guides : []
  const startSceneId = scenes.some((scene) => scene.id === value.startSceneId)
    ? value.startSceneId
    : scenes[0]?.id ?? null

  return {
    schemaVersion: 3,
    id: projectId,
    title: String(value.title || 'Untitled project').trim() || 'Untitled project',
    startSceneId,
    scenes,
    guides,
  }
}

function revisionForSnapshot(snapshot) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      title: snapshot.title,
      startSceneId: snapshot.startSceneId,
      scenes: snapshot.scenes,
      guides: snapshot.guides,
    }))
    .digest('hex')
    .slice(0, 16)
}

function manifestFromSnapshot(snapshot, revision, publishedAt = null) {
  const assets = new Set()
  collectAssets(snapshot.scenes, assets)
  collectAssets(snapshot.guides, assets)

  return {
    ...snapshot,
    revision,
    publishedAt,
    assets: [...assets],
  }
}

async function ensureProjectDirectory(projectId) {
  await fs.mkdir(projectDir(projectId), { recursive: true })
  await fs.mkdir(versionsDir(projectId), { recursive: true })
}

async function ensureDefaultProject() {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true })

  const existing = await readJson(metaPath('default'))
  if (existing) return existing

  const [legacyScenes, legacyGuides] = await Promise.all([
    readJson(LEGACY_SCENES_PATH, []),
    readJson(LEGACY_GUIDES_PATH, []),
  ])

  const snapshot = normalizeSnapshot('default', {
    title: '3DVR Project',
    scenes: legacyScenes,
    guides: legacyGuides,
    startSceneId: legacyScenes[0]?.id ?? null,
  })

  const revision = revisionForSnapshot(snapshot)
  const timestamp = nowIso()
  const published = manifestFromSnapshot(snapshot, revision, timestamp)
  const meta = {
    id: 'default',
    title: snapshot.title,
    createdAt: timestamp,
    updatedAt: timestamp,
    draftRevision: revision,
    publishedRevision: revision,
    publishedAt: timestamp,
  }

  await ensureProjectDirectory('default')
  await Promise.all([
    writeJsonAtomic(draftPath('default'), snapshot),
    writeJsonAtomic(publishedPath('default'), published),
    writeJsonAtomic(versionPath('default', revision), published),
    writeJsonAtomic(metaPath('default'), meta),
  ])

  return meta
}

async function ensureProject(projectId) {
  const id = sanitizeProjectId(projectId)
  if (id === 'default') await ensureDefaultProject()

  const meta = await readJson(metaPath(id))
  if (!meta) {
    const error = new Error('Project not found')
    error.status = 404
    throw error
  }
  return meta
}

function withStatus(meta) {
  return {
    ...meta,
    hasUnpublishedChanges: Boolean(
      meta.draftRevision && meta.draftRevision !== meta.publishedRevision
    ),
    isPublished: Boolean(meta.publishedRevision),
  }
}

async function uniqueProjectId(title) {
  const base = slugify(title)
  let candidate = base
  let counter = 2

  while (await readJson(metaPath(candidate))) {
    candidate = `${base.slice(0, 56)}-${counter}`
    counter += 1
  }

  return candidate
}

export async function listProjects() {
  await ensureDefaultProject()
  await fs.mkdir(PROJECTS_ROOT, { recursive: true })

  const entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true })
  const projects = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const meta = await readJson(metaPath(entry.name))
    if (meta) projects.push(withStatus(meta))
  }

  return projects.sort((a, b) => (
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  ))
}

export async function getProjectMeta(projectId) {
  return withStatus(await ensureProject(projectId))
}

export async function getProjectDraft(projectId) {
  const meta = await ensureProject(projectId)
  const draft = await readJson(draftPath(meta.id))
  if (!draft) throw new Error('Project draft is missing')

  return {
    ...normalizeSnapshot(meta.id, draft),
    meta: withStatus(meta),
  }
}

export async function saveProjectDraft(projectId, value) {
  const meta = await ensureProject(projectId)
  const snapshot = normalizeSnapshot(meta.id, value)
  const revision = revisionForSnapshot(snapshot)
  const timestamp = nowIso()
  const nextMeta = {
    ...meta,
    title: snapshot.title,
    updatedAt: timestamp,
    draftRevision: revision,
  }

  await Promise.all([
    writeJsonAtomic(draftPath(meta.id), snapshot),
    writeJsonAtomic(metaPath(meta.id), nextMeta),
  ])

  return {
    ...snapshot,
    meta: withStatus(nextMeta),
  }
}

export async function publishProject(projectId) {
  const meta = await ensureProject(projectId)
  const draft = normalizeSnapshot(meta.id, await readJson(draftPath(meta.id), {}))
  const revision = revisionForSnapshot(draft)
  const timestamp = nowIso()
  const published = manifestFromSnapshot(draft, revision, timestamp)
  const nextMeta = {
    ...meta,
    title: draft.title,
    updatedAt: timestamp,
    draftRevision: revision,
    publishedRevision: revision,
    publishedAt: timestamp,
  }

  await Promise.all([
    writeJsonAtomic(publishedPath(meta.id), published),
    writeJsonAtomic(versionPath(meta.id, revision), published),
    writeJsonAtomic(metaPath(meta.id), nextMeta),
  ])

  return {
    manifest: published,
    meta: withStatus(nextMeta),
  }
}

export async function getPublishedManifest(projectId) {
  const meta = await ensureProject(projectId)
  const manifest = await readJson(publishedPath(meta.id))

  if (!manifest) {
    const error = new Error('Project has not been published yet')
    error.status = 404
    throw error
  }

  return manifest
}

export async function createProject({ title, duplicateFrom = null } = {}) {
  await ensureDefaultProject()

  const projectTitle = String(title || '').trim() || 'Untitled project'
  const id = await uniqueProjectId(projectTitle)
  const timestamp = nowIso()
  let source = null

  if (duplicateFrom) {
    source = await getProjectDraft(duplicateFrom)
  }

  const snapshot = normalizeSnapshot(id, source ? {
    ...source,
    title: projectTitle,
  } : {
    title: projectTitle,
    startSceneId: 'scene-1',
    scenes: [
      {
        id: 'scene-1',
        title: 'Scene 1',
        image: '/demo/lobby.jpg',
        hotspots: [],
      },
    ],
    guides: [],
  })

  const revision = revisionForSnapshot(snapshot)
  const meta = {
    id,
    title: snapshot.title,
    createdAt: timestamp,
    updatedAt: timestamp,
    draftRevision: revision,
    publishedRevision: null,
    publishedAt: null,
  }

  await ensureProjectDirectory(id)
  await Promise.all([
    writeJsonAtomic(draftPath(id), snapshot),
    writeJsonAtomic(metaPath(id), meta),
  ])

  return {
    ...snapshot,
    meta: withStatus(meta),
  }
}

export async function getProjectVersion(projectId, revision) {
  const meta = await ensureProject(projectId)
  if (!/^[a-f0-9]{16}$/i.test(String(revision || ''))) {
    const error = new Error('Invalid revision')
    error.status = 400
    throw error
  }

  const version = await readJson(versionPath(meta.id, revision))
  if (!version) {
    const error = new Error('Project revision not found')
    error.status = 404
    throw error
  }
  return version
}
