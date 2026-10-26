import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { contentSignature, mergeSavedDraft } from '../editor/draftState'

export function useProjectDraft(projectId) {
  const auth = useAuth()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const projectRef = useRef(null)
  const history = useRef({ past: [], future: [] })
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 })
  const savingRef = useRef(false)
  const savedSignature = useRef('')

  const commitProject = useCallback((next) => {
    projectRef.current = next
    setProject(next)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/draft`, {
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `Project ${response.status}`)
      commitProject(body)
      savedSignature.current = contentSignature(body)
      history.current = { past: [], future: [] }
      setHistorySize({ past: 0, future: 0 })
      setDirty(false)
    } catch (loadError) {
      setError(loadError.message || 'Could not load project')
    } finally {
      setLoading(false)
    }
  }, [commitProject, projectId])

  useEffect(() => {
    load()
  }, [load])

  const updateProject = useCallback((updater) => {
    const previous = projectRef.current
    if (!previous) return
    const next = typeof updater === 'function' ? updater(previous) : updater
    if (next === previous || JSON.stringify(next) === JSON.stringify(previous)) return
    history.current.past = [...history.current.past.slice(-59), previous]
    history.current.future = []
    setHistorySize({ past: history.current.past.length, future: 0 })
    commitProject(next)
    setDirty(contentSignature(next) !== savedSignature.current)
  }, [commitProject])

  const travelHistory = useCallback((direction) => {
    const source = history.current[direction === 'undo' ? 'past' : 'future']
    const destination = history.current[direction === 'undo' ? 'future' : 'past']
    if (!source.length) return
    destination.push(projectRef.current)
    const next = source.pop()
    commitProject({ ...next, meta: projectRef.current.meta })
    setHistorySize({ past: history.current.past.length, future: history.current.future.length })
    setDirty(contentSignature(next) !== savedSignature.current)
  }, [commitProject])

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

  const saveDraft = useCallback(async (value = projectRef.current) => {
    if (!value || savingRef.current) return null
    savingRef.current = true
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
      // A save may finish after the user has made another edit. Keep those edits.
      const result = mergeSavedDraft(projectRef.current, value, body)
      savedSignature.current = contentSignature(body)
      commitProject(result.project)
      setDirty(result.dirty)
      return body
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [auth?.token, commitProject, projectId])

  const publish = useCallback(async () => {
    setPublishing(true)
    setError('')

    try {
      const snapshot = projectRef.current
      const saved = dirty ? await saveDraft(snapshot) : snapshot
      if (!saved) throw new Error('Project is not loaded')

      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/publish`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth?.token || ''}`,
        },
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Publish failed')

      const unchanged = projectRef.current === saved
      commitProject(projectRef.current ? {
        ...projectRef.current,
        meta: body.meta,
      } : null)
      setDirty(!unchanged)
      return body
    } finally {
      setPublishing(false)
    }
  }, [auth?.token, commitProject, dirty, projectId, saveDraft])

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

  const undo = useCallback(() => travelHistory('undo'), [travelHistory])
  const redo = useCallback(() => travelHistory('redo'), [travelHistory])

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
    canUndo: historySize.past > 0,
    canRedo: historySize.future > 0,
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
