import { useCallback, useEffect, useRef, useState } from 'react'
import { getAuthHeaders } from '../contexts/AuthContext'

export function useScenes() {
  const [scenes, setScenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Keep a stable ref for use inside callbacks without stale closure issues
  const scenesRef = useRef(scenes)
  scenesRef.current = scenes

  const fetchScenes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/scenes')
      if (!res.ok) throw new Error('Failed to load scenes')
      const data = await res.json()
      setScenes(data)
    } catch (err) {
      console.error('[useScenes] fetch error', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchScenes() }, [fetchScenes])

  const saveScenes = useCallback(async (data) => {
    const res = await fetch('/api/scenes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Save failed')
    }
    setScenes(data)
  }, [])

  const uploadImage = useCallback(async (file) => {
    const form = new FormData()
    form.append('image', file)
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Upload failed')
    }
    const { url } = await res.json()
    return url
  }, [])

  return { scenes, loading, error, saveScenes, updateScenes: setScenes, uploadImage, refetch: fetchScenes }
}
