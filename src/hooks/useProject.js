import { useCallback, useEffect, useState } from 'react'
import { getDownloadedProject, removeDownloadedProject } from '../offline/projectStore'

export function useProject(projectId) {
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [errorStatus,setErrorStatus]=useState(null)
  const [source, setSource] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setErrorStatus(null)

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/manifest`, {
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        if ([401,403,404].includes(response.status)) await removeDownloadedProject(projectId).catch(() => {})
        throw Object.assign(new Error(body.error || `Project ${response.status}`), { httpStatus:response.status })
      }
      setProject(body)
      setSource('network')
    } catch (networkError) {
      const local = networkError.httpStatus ? null : await getDownloadedProject(projectId).catch(() => null)
      if (local) {
        setProject(local)
        setSource('offline')
      } else {
        setProject(null)
        setError(networkError.message)
        setErrorStatus(networkError.httpStatus || null)
      }
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  return { project, loading, error, errorStatus, source, reload: load }
}
