import { useEffect, useState } from 'react'
import { watchXRCapabilities } from '../viewer/xrCapabilities'

export function useViewerCapabilities() {
  const [state, setState] = useState({ secureContext: window.isSecureContext, webXR: Boolean(navigator.xr), immersiveVRSupported: false, immersiveVRChecking: true, immersiveVRReason: 'Checking VR headset support…', deviceOrientation: 'DeviceOrientationEvent' in window })
  useEffect(() => watchXRCapabilities(window, (next) => setState((current) => ({ ...current, ...next }))), [])
  return state
}
