import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { contentSignature, createDraftState, draftContent, editDraft, moveDraftHistory, receiveSavedDraft } from '../src/editor/draftState.js'
import { normalizeProjectMetadata } from '../src/projectMetadata.js'
import { normalizeProjectSettings, projectViewerSettings } from '../src/projectSettings.js'

async function projectStore(t) {
  const directory = await mkdtemp(fileURLToPath(new URL('./.project-store-', import.meta.url)))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(path.join(directory, 'server'))
  await mkdir(path.join(directory, 'src'))
  const modulePath = path.join(directory, 'server', 'projectStore.mjs')
  await copyFile(new URL('../server/projectStore.js', import.meta.url), modulePath)
  await copyFile(new URL('../server/accountFiles.js', import.meta.url), path.join(directory,'server','accountFiles.js'))
  await copyFile(new URL('../src/projectMetadata.js', import.meta.url), path.join(directory, 'src', 'projectMetadata.js'))
  await copyFile(new URL('../src/projectSettings.js', import.meta.url), path.join(directory, 'src', 'projectSettings.js'))
  return { store: await import(pathToFileURL(modulePath)), directory: path.join(directory, 'storage') }
}

test('parallel project creation preserves both blank projects', async (t) => {
  const { store } = await projectStore(t)
  const [first, second] = await Promise.all([
    store.createProject({ title: 'Workshop' }),
    store.createProject({ title: 'Workshop' }),
  ])
  assert.notEqual(first.id, second.id)
  assert.equal(first.scenes[0].image, '')
  assert.equal(first.startSceneId, first.scenes[0].id)
  assert.equal((await store.getProjectDraft(first.id)).title, 'Workshop')
  assert.equal((await store.getProjectDraft(second.id)).title, 'Workshop')
})

test('a copy can include current unsaved edits without saving or publishing the original', async (t) => {
  const { store } = await projectStore(t)
  const original = await store.createProject({ title: 'Workshop' })
  const scenes = [{ ...original.scenes[0], title: 'Unsaved scene title' }]
  const copy = await store.createProject({
    title: 'Workshop copy',
    duplicateFrom: original.id,
    draft: { ...original, scenes },
  })
  assert.deepEqual(copy.scenes, scenes)
  assert.equal(copy.meta.isPublished, false)
  assert.deepEqual(await store.getProjectDraft(original.id), original)
})

test('concurrent saves from one base revision preserve the winner and report the conflict', async (t) => {
  const { store } = await projectStore(t)
  const project = await store.createProject({ title: 'Workshop' })
  const submitted = { ...project, expectedDraftRevision: project.meta.draftRevision }
  const [first, second] = await Promise.allSettled([
    store.saveProjectDraft(project.id, { ...submitted, title: 'First edit' }),
    store.saveProjectDraft(project.id, { ...submitted, title: 'Second edit' }),
  ])
  assert.equal(first.status, 'fulfilled')
  assert.equal(second.status, 'rejected')
  assert.equal(second.reason.status, 409)
  const saved = await store.getProjectDraft(project.id)
  assert.equal(saved.title, 'First edit')
  assert.equal(saved.meta.draftRevision, first.value.meta.draftRevision)
  await assert.rejects(store.getPublishedManifest(project.id), { status: 404 })

  const retry = await store.saveProjectDraft(project.id, { ...submitted, title: 'First edit' })
  assert.equal(retry.meta.draftRevision, saved.meta.draftRevision)
})

test('publish applies the reviewed content and rejects a concurrent save based on the previous draft', async (t) => {
  const { store } = await projectStore(t)
  const project = await store.createProject({ title: 'Workshop' })
  const draft = {
    ...project,
    title: '  Reviewed version  ',
    scenes: [{ ...project.scenes[0], image: '/uploads/workshop.jpg' }],
  }
  const expectedDraftRevision = project.meta.draftRevision
  const [publish, save] = await Promise.allSettled([
    store.publishProject(project.id, { draft, expectedDraftRevision }),
    store.saveProjectDraft(project.id, { ...project, title: 'Other editor', expectedDraftRevision }),
  ])
  assert.equal(publish.status, 'fulfilled')
  assert.equal(save.status, 'rejected')
  assert.equal(save.reason.status, 409)
  const { manifest, meta } = publish.value
  assert.equal(manifest.title, 'Reviewed version')
  assert.deepEqual(manifest.assets, ['/uploads/workshop.jpg'])
  assert.equal(meta.draftRevision, manifest.revision)
  assert.equal(meta.publishedRevision, manifest.revision)
  assert.equal(meta.hasUnpublishedChanges, false)
  assert.deepEqual(await store.getPublishedManifest(project.id), manifest)
  assert.deepEqual(await store.getProjectVersion(project.id, manifest.revision), manifest)
  assert.equal((await store.getProjectDraft(project.id)).title, 'Reviewed version')

  const retry = await store.publishProject(project.id, { draft, expectedDraftRevision })
  assert.deepEqual(retry.manifest, manifest)
})

test('a stale publish leaves the saved draft and live revision alone', async (t) => {
  const { store } = await projectStore(t)
  const project = await store.createProject({ title: 'Workshop' })
  const initial = await store.publishProject(project.id)
  const saved = await store.saveProjectDraft(project.id, {
    ...project,
    title: 'Other editor',
    expectedDraftRevision: project.meta.draftRevision,
  })
  await assert.rejects(store.publishProject(project.id, {
    draft: { ...project, title: 'Stale editor' },
    expectedDraftRevision: project.meta.draftRevision,
  }), { status: 409 })
  assert.equal((await store.getProjectDraft(project.id)).meta.draftRevision, saved.meta.draftRevision)
  assert.deepEqual(await store.getPublishedManifest(project.id), initial.manifest)
})

test('project status uses persisted snapshots if metadata was written before an interruption', async (t) => {
  const { store, directory } = await projectStore(t)
  const project = await store.createProject({ title: 'Workshop' })
  const metaPath = path.join(directory, 'data', 'projects', project.id, 'meta.json')
  const stored = JSON.parse(await readFile(metaPath, 'utf8'))
  await writeFile(metaPath, JSON.stringify({ ...stored, draftRevision: 'wrong', publishedRevision: 'wrong' }))
  const recovered = await store.getProjectDraft(project.id)
  assert.equal(recovered.meta.draftRevision, project.meta.draftRevision)
  assert.equal(recovered.meta.isPublished, false)
  const saved = await store.saveProjectDraft(project.id, {
    ...project,
    title: 'Recovered',
    expectedDraftRevision: recovered.meta.draftRevision,
  })
  assert.equal(saved.title, 'Recovered')
})

test('draft history keeps the server revision after save while preserving later edits', () => {
  const initial = { title: 'Loaded', scenes: [], guides: [], meta: { draftRevision: 'old' } }
  let state = createDraftState(initial)
  state = editDraft(state, { ...initial, title: 'Submitted' })
  const submitted = state.project
  state = editDraft(state, { ...submitted, title: 'Typed while saving' })
  state = receiveSavedDraft(state, submitted, { ...submitted, meta: { draftRevision: 'saved' } })
  assert.equal(state.project.title, 'Typed while saving')
  assert.equal(state.dirty, true)

  state = moveDraftHistory(state, 'undo')
  assert.equal(state.project.title, 'Submitted')
  assert.equal(state.project.meta.draftRevision, 'saved')
  assert.equal(state.dirty, false)
  state = moveDraftHistory(state, 'redo')
  assert.equal(state.project.title, 'Typed while saving')
  assert.equal(state.dirty, true)
})

test('project metadata survives save, publish, version retrieval, and unsaved duplication', async (t) => {
  const { store } = await projectStore(t)
  const project = await store.createProject({ title: 'Atelier tour' })
  const metadata = {
    description: 'A guided visit through the atelier.', author: 'Ana Silva',
    organization: 'Atelier', contributors: 'Photography: Studio team',
    language: 'pt-PT', keywords: 'architecture, atelier',
    license: 'CC BY 4.0', rights: 'Attribution required.',
  }
  const saved = await store.saveProjectDraft(project.id, {
    ...project, metadata, expectedDraftRevision: project.meta.draftRevision,
  })
  assert.deepEqual(saved.metadata, metadata)
  assert.notEqual(saved.meta.draftRevision, project.meta.draftRevision)
  assert.deepEqual((await store.getProjectDraft(project.id)).metadata, metadata)
  const { manifest } = await store.publishProject(project.id)
  assert.deepEqual(manifest.metadata, metadata)
  assert.deepEqual((await store.getProjectVersion(project.id, manifest.revision)).metadata, metadata)
  const edited = { ...saved, metadata: { ...metadata, author: 'Unsaved author' } }
  const copy = await store.createProject({ title: 'Copy', duplicateFrom: project.id, draft: draftContent(edited) })
  assert.equal(copy.metadata.author, 'Unsaved author')
  assert.equal(copy.meta.isPublished, false)
  assert.equal((await store.getPublishedManifest(project.id)).metadata.author, 'Ana Silva')
  const changed = await store.saveProjectDraft(project.id, edited)
  assert.equal(changed.meta.hasUnpublishedChanges, true)
  assert.deepEqual((await store.getPublishedManifest(project.id)).metadata, metadata)
  const cleared = await store.saveProjectDraft(project.id, { ...changed, metadata: {} })
  assert.deepEqual(cleared.metadata, {})
  assert.equal(cleared.meta.draftRevision, project.meta.draftRevision)
})

test('legacy projects keep their content revision when metadata is absent or blank', async (t) => {
  const { store, directory } = await projectStore(t)
  const project = await store.createProject({ title: 'Legacy tour' })
  const legacy = { ...project }
  delete legacy.metadata
  delete legacy.meta
  const revision = crypto.createHash('sha256').update(JSON.stringify({
    title: legacy.title, startSceneId: legacy.startSceneId, scenes: legacy.scenes, guides: legacy.guides,
  })).digest('hex').slice(0, 16)
  await writeFile(path.join(directory, 'data', 'projects', project.id, 'draft.json'), JSON.stringify(legacy))
  const loaded = await store.getProjectDraft(project.id)
  assert.deepEqual(loaded.metadata, {})
  assert.equal(loaded.meta.draftRevision, revision)
  const saved = await store.saveProjectDraft(project.id, { ...loaded, metadata: { author: '  ' } })
  assert.equal(saved.meta.draftRevision, revision)
})

test('metadata edits preserve spaces during typing and support undo, redo, and save races', () => {
  const initial = { title: 'Tour', scenes: [], guides: [], meta: { draftRevision: 'old' } }
  let state = createDraftState(initial)
  state = editDraft(state, { ...initial, metadata: { author: 'Ana ' } })
  assert.equal(state.project.metadata.author, 'Ana ')
  assert.equal(state.dirty, true)
  const submitted = state.project
  state = editDraft(state, { ...submitted, metadata: { author: 'Ana Silva' } })
  state = receiveSavedDraft(state, submitted, { ...submitted, metadata: { author: 'Ana' }, meta: { draftRevision: 'new' } })
  assert.equal(state.project.metadata.author, 'Ana Silva')
  assert.equal(state.dirty, true)
  state = moveDraftHistory(state, 'undo')
  assert.equal(state.project.metadata.author, 'Ana ')
  state = moveDraftHistory(state, 'redo')
  assert.equal(state.project.metadata.author, 'Ana Silva')
  assert.equal(state.project.meta.draftRevision, 'new')
  assert.equal(contentSignature(initial), contentSignature({ ...initial, metadata: { author: '' } }))
})

test('metadata accepts bounded text, ignores unknown fields, and never coerces objects', () => {
  assert.deepEqual(normalizeProjectMetadata({ author: ' Ana ', organization: {}, license: 123, unknown: 'no', rights: '  ' }), { author: 'Ana' })
  assert.equal(normalizeProjectMetadata({ description: 'a'.repeat(3000) }).description.length, 2000)
  assert.deepEqual(normalizeProjectMetadata(null), {})
  assert.deepEqual(normalizeProjectMetadata(['no']), {})
})

test('viewer settings survive saves, publishing, and duplication without changing the live copy early', async (t) => {
  const { store } = await projectStore(t)
  const initial = await store.createProject({ title: 'Guided workshop' })
  const published = await store.publishProject(initial.id)
  const settings = { defaultGuideId: 'welcome', showGuideMenu: false, openLinksInNewTab: true, allowOffline: false }
  const edited = { ...initial, settings, guides: [{ id: 'welcome', title: 'Welcome', steps: [{ id: 'one', sceneId: initial.startSceneId }] }] }
  const saved = await store.saveProjectDraft(initial.id, draftContent(edited))
  assert.deepEqual(saved.settings, settings)
  assert.equal(saved.meta.hasUnpublishedChanges, true)
  assert.deepEqual((await store.getPublishedManifest(initial.id)).settings, {})
  const copy = await store.createProject({ title: 'Guided copy', duplicateFrom: initial.id, draft: draftContent(edited) })
  assert.deepEqual(copy.settings, settings)
  const release = await store.publishProject(initial.id)
  assert.deepEqual(release.manifest.settings, settings)
  assert.notEqual(release.manifest.revision, published.manifest.revision)
  assert.deepEqual((await store.getProjectVersion(initial.id, release.manifest.revision)).settings, settings)
  const reset = await store.saveProjectDraft(initial.id, { ...saved, settings: {}, guides: [] })
  assert.equal(reset.meta.draftRevision, initial.meta.draftRevision)
})

test('new projects retain author and description, and the library returns content summaries', async (t) => {
  const { store } = await projectStore(t)
  const created = await store.createProject({ title: 'New studio', metadata: { author: '  Sample team  ', description: 'A studio visit.' } })
  assert.equal(created.metadata.author, 'Sample team')
  assert.equal((await store.getProjectDraft(created.id)).metadata.description, 'A studio visit.')
  const listed = (await store.listProjects()).find((item) => item.id === created.id)
  assert.equal(listed.author, 'Sample team')
  assert.equal(listed.description, 'A studio visit.')
  assert.equal(listed.sceneCount, 1)
  assert.equal(listed.guideCount, 0)
  assert.equal(listed.isPublished, false)
})

test('viewer settings preserve legacy defaults and ignore unavailable startup guides', () => {
  assert.deepEqual(normalizeProjectSettings({ defaultGuideId: '', showGuideMenu: true, openLinksInNewTab: false, allowOffline: true }), {})
  assert.deepEqual(normalizeProjectSettings({ showGuideMenu: 'false', allowOffline: 0, unknown: true }), {})
  const defaults = projectViewerSettings(null)
  assert.deepEqual(defaults, { defaultGuideId: '', showGuideMenu: true, openLinksInNewTab: false, allowOffline: true })
  assert.equal(projectViewerSettings({ settings: { defaultGuideId: 'removed' }, guides: [] }).defaultGuideId, '')
  assert.equal(projectViewerSettings({ settings: { defaultGuideId: 'empty' }, guides: [{ id: 'empty', steps: [] }] }).defaultGuideId, '')
  assert.equal(projectViewerSettings({ settings: { defaultGuideId: 'valid' }, guides: [{ id: 'valid', steps: [{ id: 'one' }] }] }).defaultGuideId, 'valid')
  const initial = { title: 'Tour', scenes: [], guides: [] }
  assert.equal(contentSignature(initial), contentSignature({ ...initial, settings: defaults }))
  let state = createDraftState(initial)
  state = editDraft(state, { ...initial, settings: { showGuideMenu: false } })
  assert.equal(state.dirty, true)
  state = moveDraftHistory(state, 'undo')
  assert.equal(state.dirty, false)
  state = moveDraftHistory(state, 'redo')
  assert.equal(state.project.settings.showGuideMenu, false)
})
