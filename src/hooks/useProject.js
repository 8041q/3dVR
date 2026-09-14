import { useCallback, useEffect, useState } from 'react'
import { getDownloadedProject } from '../offline/projectStore'

export function useProject(projectId) {
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [source, setSource] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/manifest`, {
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `Project ${response.status}`)
      setProject(body)
      setSource('network')
    } catch (networkError) {
      const local = await getDownloadedProject(projectId).catch(() => null)
      if (local) {
        setProject(local)
        setSource('offline')
      } else {
        setError(networkError.message)
      }
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  return { project, loading, error, source, reload: load }
}
