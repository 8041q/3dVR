import { useModelThumbnails } from '../contexts/ModelThumbnailContext'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { createDraftState, draftContent, editDraft, moveDraftHistory, receiveSavedDraft } from '../editor/draftState'

export function useProjectDraft(projectId) {
  const thumbnails = useModelThumbnails()
  const { token } = useAuth()
  const [draft, setDraft] = useState(createDraftState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [operation, setOperation] = useState(null)
  const draftRef = useRef(draft)
  const loadRef = useRef(null)
  const mutationRef = useRef(null)
  const projectUrl = `/api/projects/${encodeURIComponent(projectId)}`

  const commitDraft = useCallback((next) => {
    if (next === draftRef.current) return
    draftRef.current = next
    setDraft(next)
  }, [])

  const load = useCallback(async () => {
    if (mutationRef.current) return null
    loadRef.current?.abort()
    const controller = new AbortController()
    loadRef.current = controller
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${projectUrl}/draft`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `Project ${response.status}`)
      if (loadRef.current !== controller) return null
      commitDraft(createDraftState(body))
      return body
    } catch (loadError) {
      if (loadRef.current === controller) setError(loadError.message || 'Could not load project')
      return null
    } finally {
      if (loadRef.current === controller) {
        loadRef.current = null
        setLoading(false)
      }
    }
  }, [commitDraft, projectUrl])

  useEffect(() => {
    setOperation(null)
    load()
    return () => {
      loadRef.current?.abort()
      mutationRef.current?.abort()
      loadRef.current = null
      mutationRef.current = null
    }
  }, [load])

  const updateProject = useCallback((updater) => {
    commitDraft(editDraft(draftRef.current, updater))
  }, [commitDraft])

  const updateScenes = useCallback((next) => {
    updateProject((previous) => ({
      ...previous,
      scenes: typeof next === 'function' ? next(previous.scenes || []) : next,
    }))
  }, [updateProject])

  const updateGuides = useCallback((next) => {
    updateProject((previous) => ({
      ...previous,
      guides: typeof next === 'function' ? next(previous.guides || []) : next,
    }))
  }, [updateProject])

  const updateTitle = useCallback((title) => {
    updateProject((previous) => ({ ...previous, title }))
  }, [updateProject])

  const updateStartScene = useCallback((startSceneId) => {
    updateProject((previous) => ({ ...previous, startSceneId }))
  }, [updateProject])

  const writeDraft = useCallback(async (kind, submitted) => {
    if (!submitted || loadRef.current || mutationRef.current) return null
    const controller = new AbortController()
    mutationRef.current = controller
    setOperation(kind)
    const publishing = kind === 'publishing'
    const content = draftContent(submitted)
    const expectedDraftRevision = submitted.meta?.draftRevision ?? null

    try {
      const response = await fetch(`${projectUrl}/${publishing ? 'publish-draft' : 'draft'}`, {
        method: publishing ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        signal: controller.signal,
        body: JSON.stringify(publishing
          ? { draft: content, expectedDraftRevision }
          : { ...content, expectedDraftRevision }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const fallback = publishing && response.status === 404
          ? 'Could not reach the publish endpoint. Restart the Atria 3DVR server and try again.'
          : publishing ? 'Publish failed' : 'Draft save failed'
        throw new Error(body.error || fallback)
      }
      if (mutationRef.current !== controller) return null

      const saved = publishing ? { ...submitted, ...draftContent(body.manifest), meta: body.meta } : body
      commitDraft(receiveSavedDraft(draftRef.current, submitted, saved))
      return body
    } catch (writeError) {
      if (mutationRef.current !== controller) return null
      throw writeError
    } finally {
      if (mutationRef.current === controller) {
        mutationRef.current = null
        setOperation(null)
      }
    }
  }, [commitDraft, projectUrl, token])

  const saveDraft = useCallback((value = draftRef.current.project) => writeDraft('saving', value), [writeDraft])
  const publish = useCallback((value = draftRef.current.project) => writeDraft('publishing', value), [writeDraft])

  const uploadAsset = useCallback(async (file) => {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Filename': file.name,
        Authorization: `Bearer ${token || ''}`,
      },
      body: file,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Upload failed')
    if (/\.glb$/i.test(file.name)) thumbnails?.enqueue({ ...body, name: file.name, type: 'model' }, file)
    return body
  }, [token, thumbnails?.enqueue])

  const undo = useCallback(() => commitDraft(moveDraftHistory(draftRef.current, 'undo')), [commitDraft])
  const redo = useCallback(() => commitDraft(moveDraftHistory(draftRef.current, 'redo')), [commitDraft])

  const { project, dirty, past, future } = draft
  return {
    project,
    scenes: project?.scenes || [],
    guides: project?.guides || [],
    meta: project?.meta || null,
    loading,
    error,
    dirty,
    saving: operation === 'saving',
    publishing: operation === 'publishing',
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    updateScenes,
    updateProject,
    updateGuides,
    updateTitle,
    updateStartScene,
    saveDraft,
    publish,
    uploadAsset,
    reload: load,
  }
}
