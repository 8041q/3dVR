import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function useScenes() {
  const auth = useAuth()
  const [scenes, setScenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/scenes', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Scenes ${response.status}`)
        return response.json()
      })
      .then(setScenes)
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false))
  }, [])

  const updateScenes = useCallback((next) => {
    setScenes((previous) => typeof next === 'function' ? next(previous) : next)
  }, [])

  const saveScenes = useCallback(async (value = scenes) => {
    const response = await fetch('/api/scenes', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth?.token || ''}`,
      },
      body: JSON.stringify(value),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Save failed')
    return body
  }, [auth?.token, scenes])

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

  const uploadImage = useCallback(async (file) => {
    const result = await uploadAsset(file)
    return result.url
  }, [uploadAsset])

  return {
    scenes,
    loading,
    error,
    updateScenes,
    saveScenes,
    uploadImage,
    uploadAsset,
  }
}
