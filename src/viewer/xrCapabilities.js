export function watchXRCapabilities(source, publish) {
  let revision = 0, stopped = false
  const xr = source.navigator.xr
  async function check() {
    const ticket = ++revision
    const update = (supported, reason, checking = false) => {
      if (!stopped && ticket === revision) publish({ immersiveVRSupported: supported, immersiveVRReason: reason, immersiveVRChecking: checking })
    }
    if (!source.isSecureContext) return update(false, 'VR Headset requires HTTPS (or localhost).')
    if (!xr?.isSessionSupported) return update(false, 'This browser does not support WebXR immersive VR.')
    update(false, 'Checking VR headset support…', true)
    try {
      const supported = await xr.isSessionSupported('immersive-vr')
      update(supported, supported ? 'WebXR VR available. Your headset system handles tracking and headset setup.' : 'No supported VR session is available. Connect a headset and use a compatible browser/runtime.')
    } catch (error) { update(false, error.message || 'Could not check WebXR support.') }
  }
  const visible = () => { if (source.document.visibilityState === 'visible') void check() }
  xr?.addEventListener?.('devicechange', check)
  source.addEventListener('focus', check)
  source.document.addEventListener('visibilitychange', visible)
  void check()
  return () => {
    stopped = true; ++revision
    xr?.removeEventListener?.('devicechange', check)
    source.removeEventListener('focus', check)
    source.document.removeEventListener('visibilitychange', visible)
  }
}
