import { requireEditor } from './auth.js'
import { projectChecks } from '../src/editor/projectChecks.js'
import {
  createProject,
  getProjectDraft,
  getProjectMeta,
  getProjectVersion,
  getPublishedManifest,
  listProjects,
  publishProject,
  saveProjectDraft,
} from './projectStore.js'

function sendError(res, error) {
  const status = error.status || 500
  if (status >= 500) console.error('[projects]', error)
  return res.status(status).json({ error: error.message || 'Project operation failed' })
}

function validateRelease(snapshot) {
  const issues = projectChecks(snapshot)
  if (issues.length) {
    const extra = issues.length > 1 ? ` (${issues.length} items to resolve)` : ''
    throw Object.assign(new Error(`${issues[0].message}${extra}`), { status: 422 })
  }
}

export function createProjectsRouter(express) {
  const router = express.Router()

  router.get('/', async (_req, res) => {
    try {
      res.set('Cache-Control', 'no-store')
      return res.json(await listProjects())
    } catch (error) {
      return sendError(res, error)
    }
  })

  router.post('/', requireEditor, async (req, res) => {
    try {
      const { title, duplicateFrom, draft } = req.body || {}
      if (draft && (!duplicateFrom || !Array.isArray(draft.scenes) || !Array.isArray(draft.guides))) {
        return res.status(400).json({ error: 'Choose a project and provide its draft to create a copy.' })
      }
      const project = await createProject({
        title,
        duplicateFrom,
        draft,
      })
      return res.status(201).json(project)
    } catch (error) {
      return sendError(res, error)
    }
  })

  router.get('/:projectId/meta', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store')
      return res.json(await getProjectMeta(req.params.projectId))
    } catch (error) {
      return sendError(res, error)
    }
  })

  router.get('/:projectId/draft', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store')
      return res.json(await getProjectDraft(req.params.projectId))
    } catch (error) {
      return sendError(res, error)
    }
  })

  router.put('/:projectId/draft', requireEditor, async (req, res) => {
    try {
      return res.json(await saveProjectDraft(req.params.projectId, req.body || {}))
    } catch (error) {
      return sendError(res, error)
    }
  })

  router.post('/:projectId/publish', requireEditor, async (req, res) => {
    try {
      return res.json(await publishProject(req.params.projectId, { validate: validateRelease }))
    } catch (error) {
      return sendError(res, error)
    }
  })

  router.post('/:projectId/publish-draft', requireEditor, async (req, res) => {
    const { draft, expectedDraftRevision } = req.body || {}
    if (!Array.isArray(draft?.scenes) || !Array.isArray(draft?.guides) || typeof expectedDraftRevision !== 'string') {
      return res.status(400).json({ error: 'Publishing requires the reviewed draft and the revision it was based on.' })
    }
    try {
      return res.json(await publishProject(req.params.projectId, { draft, expectedDraftRevision, validate: validateRelease }))
    } catch (error) {
      return sendError(res, error)
    }
  })

  router.get('/:projectId/manifest', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store')
      return res.json(await getPublishedManifest(req.params.projectId))
    } catch (error) {
      return sendError(res, error)
    }
  })

  router.get('/:projectId/versions/:revision', async (req, res) => {
    try {
      res.set('Cache-Control', 'public, max-age=31536000, immutable')
      return res.json(await getProjectVersion(req.params.projectId, req.params.revision))
    } catch (error) {
      return sendError(res, error)
    }
  })

  return router
}
