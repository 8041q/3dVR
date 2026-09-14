import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function useProjectDraft(projectId) {
  const auth = useAuth()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/draft`, {
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `Project ${response.status}`)
      setProject(body)
      setDirty(false)
    } catch (loadError) {
      setError(loadError.message || 'Could not load project')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const updateProject = useCallback((updater) => {
    setProject((previous) => {
      if (!previous) return previous
      return typeof updater === 'function' ? updater(previous) : updater
    })
    setDirty(true)
  }, [])

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

  const saveDraft = useCallback(async (value = project) => {
    if (!value) return null
    setSaving(true)
    setError('')

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/draft`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth?.token || ''}`,
        },
        body: JSON.stringify({
          title: value.title,
          startSceneId: value.startSceneId,
          scenes: value.scenes || [],
          guides: value.guides || [],
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Draft save failed')
      setProject(body)
      setDirty(false)
      return body
    } finally {
      setSaving(false)
    }
  }, [auth?.token, project, projectId])

  const publish = useCallback(async () => {
    setPublishing(true)
    setError('')

    try {
      const saved = dirty ? await saveDraft(project) : project
      if (!saved) throw new Error('Project is not loaded')

      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/publish`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth?.token || ''}`,
        },
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Publish failed')

      setProject((previous) => previous ? {
        ...previous,
        meta: body.meta,
      } : previous)
      setDirty(false)
      return body
    } finally {
      setPublishing(false)
    }
  }, [auth?.token, dirty, project, projectId, saveDraft])

  const uploadAsset = useCallback(async (file) => {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Filename': file.name,
        Authorization: `Bearer ${auth?.token || ''}`,
      },
      body: file,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Upload failed')
    return body
  }, [auth?.token])

  return {
    project,
    scenes: project?.scenes || [],
    guides: project?.guides || [],
    meta: project?.meta || null,
    loading,
    error,
    dirty,
    saving,
    publishing,
    updateScenes,
    updateGuides,
    updateTitle,
    updateStartScene,
    saveDraft,
    publish,
    uploadAsset,
    reload: load,
  }
}
