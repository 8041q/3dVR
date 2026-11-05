// Own asynchronous entry separately from React so cancelled browser requests
// and old session events cannot overwrite a later mode selection.
export function createXRSessionController({ onMode, onPending, onTracking, onError }) {
  let revision = 0, session = null, pending = false, disposed = false, ending = 0, binding = null
  let restore = () => {}
  async function select(mode) {
    const ticket = ++revision
    const previous = session
    session = null
    if (previous) {
      ++ending
      try { if (binding) await binding.catch(() => {}); await previous.end() } catch {}
      restore()
      --ending
    }
    if (!disposed && ticket === revision) { onTracking('inactive'); onMode(mode) }
  }
  async function start(xr, renderer, camera) {
    if (pending || session || ending || disposed) return
    const ticket = ++revision
    pending = true; onPending(true)
    const saved = camera.clone()
    let restored = false, attached = false
    const restoreCamera = () => {
      if (restored || !attached) return
      restored = true
      const aspect = camera.aspect
      camera.copy(saved, false)
      camera.aspect = aspect
      camera.updateProjectionMatrix()
      renderer.xr.removeEventListener('sessionend', restoreCamera)
    }
    let created
    const stale = () => disposed || ticket !== revision
    try {
      created = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] })
      if (stale()) { await created.end(); return }
      let space = 'local-floor'
      try { await created.requestReferenceSpace(space) } catch { space = 'local' }
      if (stale()) { await created.end(); return }
      session = created
      restore = restoreCamera
      renderer.xr.enabled = true
      renderer.xr.setReferenceSpaceType(space)
      renderer.xr.addEventListener('sessionend', restoreCamera)
      created.addEventListener('end', () => {
        // Three restores its renderer in its own end handler. Run after it.
        queueMicrotask(() => {
          restoreCamera()
          if (session !== created) return
          session = null
          ++revision
          if (!disposed) { onTracking('inactive'); onMode('pc') }
        })
      }, { once: true })
      attached = true
      binding = renderer.xr.setSession(created)
      await binding
      if (stale() || session !== created) { await created.end().catch(() => {}); restoreCamera(); return }
      onTracking('unknown'); onMode('vr')
    } catch (error) {
      if (session === created) session = null
      if (created) await created.end().catch(() => {})
      restoreCamera()
      if (!stale()) { onTracking('inactive'); onMode('pc'); onError(error) }
    } finally {
      binding = null
      pending = false
      if (!disposed) onPending(false)
    }
  }
  return { start, select, dispose() { disposed = true; void select('pc') } }
}
