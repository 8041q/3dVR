import { requireEditor } from './auth.js'
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
      const project = await createProject({
        title: req.body?.title,
        duplicateFrom: req.body?.duplicateFrom || null,
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
      return res.json(await publishProject(req.params.projectId))
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
