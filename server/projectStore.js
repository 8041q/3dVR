import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeProjectMetadata } from '../src/projectMetadata.js'
import { normalizeProjectSettings } from '../src/projectSettings.js'
import { removeStoredPath } from './accountFiles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_ROOT = process.env.VR_DATA_ROOT ? path.resolve(process.env.VR_DATA_ROOT) : path.join(process.env.VR_STORAGE_ROOT || path.join(__dirname, '..', 'storage'), 'data')
const PROJECTS_ROOT = path.join(DATA_ROOT, 'projects')
const LEGACY_SCENES_PATH = path.join(DATA_ROOT, 'scenes.json')
const LEGACY_GUIDES_PATH = path.join(DATA_ROOT, 'guides.json')
const projectOperations = new Map()
const DEFAULT_PROJECT_INIT = Symbol('default project initialization')
const CREATE_PROJECT = Symbol('project creation')

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
  'textureUrl',
  'manifestUrl',
  'roomUrl',
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
  const temp = `${filePath}.${crypto.randomUUID()}.tmp`
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2))
    await fs.rename(temp, filePath)
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {})
    throw error
  }
}

function runProjectOperation(key, operation) {
  const previous = projectOperations.get(key) || Promise.resolve()
  const result = previous.then(operation)
  const tail = result.catch(() => {})
  projectOperations.set(key, tail)
  return result.finally(() => {
    if (projectOperations.get(key) === tail) projectOperations.delete(key)
  })
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
    metadata: normalizeProjectMetadata(value.metadata),
    settings: normalizeProjectSettings(value.settings),
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
      // Keep existing revision identifiers stable until metadata is added.
      ...(Object.keys(normalizeProjectMetadata(snapshot.metadata)).length
        ? { metadata: normalizeProjectMetadata(snapshot.metadata) } : {}),
      ...(Object.keys(normalizeProjectSettings(snapshot.settings)).length
        ? { settings: normalizeProjectSettings(snapshot.settings) } : {}),
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

function ensureDefaultProject() {
  return runProjectOperation(DEFAULT_PROJECT_INIT, initializeDefaultProject)
}

async function initializeDefaultProject() {
  await fs.mkdir(PROJECTS_ROOT, { recursive: true })

  const existing = await readJson(metaPath('default'))
  if (existing) return existing
  if(await fs.stat(path.join(DATA_ROOT,'.default-project-deleted')).then(()=>true).catch(()=>false)) return null

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
  ])
  await writeJsonAtomic(metaPath('default'), meta)

  return meta
}

export async function deleteStoredProject(projectId) {
  const id=sanitizeProjectId(projectId)
  return runProjectOperation(id,async()=> {
    if(id==='default') {
      await fs.mkdir(DATA_ROOT,{recursive:true})
      await fs.writeFile(path.join(DATA_ROOT,'.default-project-deleted'),'1')
      for(const name of ['scenes.json','guides.json']) await removeStoredPath(DATA_ROOT,name)
    }
    await removeStoredPath(PROJECTS_ROOT,id)
  })
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

async function readProjectState(meta) {
  const [savedDraft, published] = await Promise.all([
    readJson(draftPath(meta.id)),
    readJson(publishedPath(meta.id)),
  ])
  const draft = savedDraft ? normalizeSnapshot(meta.id, savedDraft) : null
  return {
    draft,
    published,
    meta: {
      ...meta,
      title: draft?.title || meta.title,
      draftRevision: draft ? revisionForSnapshot(draft) : null,
      publishedRevision: published?.revision || null,
      publishedAt: published?.publishedAt || null,
    },
  }
}

function checkDraftRevision(current, expected, submitted) {
  if (expected === undefined || current === expected || current === submitted) return
  const error = new Error('This draft changed in another tab or session. Your edits are still here. Open the latest draft in a new tab to compare them before reloading.')
  error.status = 409
  throw error
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
    const meta = await runProjectOperation(entry.name, async () => {
      const stored = await readJson(metaPath(entry.name))
      if (!stored) return null
      const { draft, meta } = await readProjectState(stored)
      return {
        ...withStatus(meta),
        author: draft?.metadata?.author || '',
        description: draft?.metadata?.description || '',
        sceneCount: draft?.scenes?.length || 0,
        guideCount: draft?.guides?.length || 0,
      }
    })
    if (meta) projects.push(meta)
  }

  return projects.sort((a, b) => (
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  ))
}

export async function getProjectMeta(projectId) {
  const id = sanitizeProjectId(projectId)
  return runProjectOperation(id, async () => {
    const { meta } = await readProjectState(await ensureProject(id))
    return withStatus(meta)
  })
}

export async function getProjectDraft(projectId) {
  const id = sanitizeProjectId(projectId)
  return runProjectOperation(id, async () => {
    const { draft, meta } = await readProjectState(await ensureProject(id))
    if (!draft) throw new Error('Project draft is missing')
    return { ...draft, meta: withStatus(meta) }
  })
}

export async function saveProjectDraft(projectId, value = {}) {
  const id = sanitizeProjectId(projectId)
  return runProjectOperation(id, async () => {
    const { meta } = await readProjectState(await ensureProject(id))
    const snapshot = normalizeSnapshot(id, value)
    const revision = revisionForSnapshot(snapshot)
    checkDraftRevision(meta.draftRevision, value.expectedDraftRevision, revision)
    if (revision === meta.draftRevision) return { ...snapshot, meta: withStatus(meta) }

    const nextMeta = { ...meta, title: snapshot.title, updatedAt: nowIso(), draftRevision: revision }
    // Draft and published files determine revisions on read, even after an interrupted write.
    await writeJsonAtomic(metaPath(id), nextMeta)
    await writeJsonAtomic(draftPath(id), snapshot)
    return { ...snapshot, meta: withStatus(nextMeta) }
  })
}

export async function publishProject(projectId, { draft: submitted, expectedDraftRevision, validate } = {}) {
  const id = sanitizeProjectId(projectId)
  return runProjectOperation(id, async () => {
    const { draft, published, meta } = await readProjectState(await ensureProject(id))
    const snapshot = submitted ? normalizeSnapshot(id, submitted) : draft
    if (!snapshot) throw new Error('Project draft is missing')
    const revision = revisionForSnapshot(snapshot)
    checkDraftRevision(meta.draftRevision, expectedDraftRevision, submitted ? revision : undefined)
    validate?.(snapshot)
    const timestamp = nowIso()
    const manifest = published?.revision === revision ? published : manifestFromSnapshot(snapshot, revision, timestamp)
    const draftChanged = revision !== meta.draftRevision
    if (!draftChanged && manifest === published) return { manifest, meta: withStatus(meta) }

    const nextMeta = {
      ...meta,
      title: snapshot.title,
      updatedAt: timestamp,
      draftRevision: revision,
      publishedRevision: revision,
      publishedAt: manifest.publishedAt,
    }

    if (!await readJson(versionPath(id, revision))) await writeJsonAtomic(versionPath(id, revision), manifest)
    await writeJsonAtomic(metaPath(id), nextMeta)
    if (draftChanged) await writeJsonAtomic(draftPath(id), snapshot)
    if (manifest !== published) await writeJsonAtomic(publishedPath(id), manifest)
    return { manifest, meta: withStatus(nextMeta) }
  })
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

export async function createProject({ title, metadata, duplicateFrom = null, draft = null } = {}) {
  return runProjectOperation(CREATE_PROJECT, () => createProjectSnapshot(title, duplicateFrom, draft, metadata))
}

async function createProjectSnapshot(title, duplicateFrom, draft, metadata) {
  await ensureDefaultProject()

  const projectTitle = String(title || '').trim() || 'Untitled project'
  const id = await uniqueProjectId(projectTitle)
  const timestamp = nowIso()
  let source = null

  if (duplicateFrom && draft) {
    await ensureProject(duplicateFrom)
    source = draft
  } else if (duplicateFrom) {
    source = await getProjectDraft(duplicateFrom)
  }

  const snapshot = normalizeSnapshot(id, source ? {
    ...source,
    title: projectTitle,
  } : {
    title: projectTitle,
    metadata,
    startSceneId: 'scene-1',
    scenes: [
      {
        id: 'scene-1',
        title: 'Scene 1',
        image: '',
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
  await writeJsonAtomic(draftPath(id), snapshot)
  await writeJsonAtomic(metaPath(id), meta)

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

// Capture draft, publication and history together while project writes are locked.
export async function exportProjectState(projectId, { draft: submitted, expectedDraftRevision } = {}) {
  const id = sanitizeProjectId(projectId)
  return runProjectOperation(id, async () => {
    const state = await readProjectState(await ensureProject(id))
    if (submitted) checkDraftRevision(state.meta.draftRevision, expectedDraftRevision)
    const draft = submitted ? normalizeSnapshot(id, submitted) : state.draft
    const files = [
      { path: 'draft.json', value: draft },
      { path: 'meta.json', value: { ...state.meta, title: draft.title, draftRevision: revisionForSnapshot(draft) } },
    ]
    if (state.published) files.push({ path: 'published.json', value: state.published })
    for (const name of await fs.readdir(versionsDir(id))) {
      if (/^[a-f0-9]{16}\.json$/i.test(name)) files.push({ path: `versions/${name}`, file: path.join(versionsDir(id), name) })
    }
    return { id, title: draft.title, files }
  })
}

// Imports never replace a project or publish automatically. Imported releases
// remain available as history, with revisions rebuilt after media URLs change.
export async function importProjectState({ draft, published, versions = [] }) {
  return runProjectOperation(CREATE_PROJECT, async () => {
    await ensureDefaultProject()
    const id = await uniqueProjectId(draft.title || 'Imported project')
    const snapshot = normalizeSnapshot(id, draft)
    const timestamp = nowIso()
    const meta = {
      id, title: snapshot.title, createdAt: timestamp, updatedAt: timestamp,
      draftRevision: revisionForSnapshot(snapshot), publishedRevision: null, publishedAt: null,
    }
    const staging = path.join(DATA_ROOT, `.project-import-${crypto.randomUUID()}`)
    try {
      await fs.mkdir(path.join(staging, 'versions'), { recursive: true })
      for (const version of [...versions, ...(published ? [published] : [])]) {
        const content = normalizeSnapshot(id, version)
        const revision = revisionForSnapshot(content)
        await writeJsonAtomic(path.join(staging, 'versions', `${revision}.json`), manifestFromSnapshot(content, revision, version.publishedAt || null))
      }
      await writeJsonAtomic(path.join(staging, 'draft.json'), snapshot)
      await writeJsonAtomic(path.join(staging, 'meta.json'), meta)
      await fs.rename(staging, projectDir(id))
      return { ...snapshot, meta: withStatus(meta) }
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
    }
  })
}
