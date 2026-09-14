import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function useGuides() {
  const auth = useAuth()
  const [guides, setGuides] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/guides', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Guides ${response.status}`)
        return response.json()
      })
      .then(setGuides)
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false))
  }, [])

  const updateGuides = useCallback((next) => {
    setGuides((previous) => typeof next === 'function' ? next(previous) : next)
  }, [])

  const saveGuides = useCallback(async (value = guides) => {
    const response = await fetch('/api/guides', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth?.token || ''}`,
      },
      body: JSON.stringify(value),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Guide save failed')
    return body
  }, [auth?.token, guides])

  return {
    guides,
    loading,
    error,
    updateGuides,
    saveGuides,
  }
}
