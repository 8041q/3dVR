import { useEffect, useState } from 'react'

export function useViewerCapabilities() {
  const [state, setState] = useState({ secureContext: window.isSecureContext, webXR: Boolean(navigator.xr), immersiveVRSupported: false, immersiveVRReason: 'Checking VR support…', deviceOrientation: 'DeviceOrientationEvent' in window })
  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!window.isSecureContext) return !cancelled && setState((s) => ({ ...s, immersiveVRSupported: false, immersiveVRReason: 'WebXR requires HTTPS (localhost is the development exception).' }))
      if (!navigator.xr?.isSessionSupported) return !cancelled && setState((s) => ({ ...s, immersiveVRSupported: false, immersiveVRReason: 'This browser does not expose WebXR immersive VR.' }))
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-vr')
        if (!cancelled) setState((s) => ({ ...s, webXR: true, immersiveVRSupported: supported, immersiveVRReason: supported ? 'Immersive VR available.' : 'No immersive VR session is available on this browser/device.' }))
      } catch (e) { if (!cancelled) setState((s) => ({ ...s, immersiveVRSupported: false, immersiveVRReason: e.message || 'Could not query WebXR.' })) }
    }
    check(); return () => { cancelled = true }
  }, [])
  return state
}
