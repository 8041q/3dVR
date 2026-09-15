import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { normalizePhoneViewProfile } from '../phoneViewProfile'

/**
 * Phone split-screen renderer.
 *
 * Important: THREE.StereoCamera needs aspect=0.5 for a normal 50/50 side-by-side
 * target. Earlier phases left it at 1, so each eye used the full-screen aspect
 * while being rendered into half of the screen. That caused a visibly shifted /
 * squeezed stereo presentation on real phones.
 */
export default function PhoneStereoRenderer({ enabled, profile }) {
  const { gl, scene, camera } = useThree()
  const stereo = useMemo(() => new THREE.StereoCamera(), [])
  const bufferSize = useMemo(() => new THREE.Vector2(), [])

  useFrame(() => {
    if (!enabled) return
    const settings = normalizePhoneViewProfile(profile)

    gl.getDrawingBufferSize(bufferSize)
    const fullWidth = Math.max(2, Math.floor(bufferSize.x))
    const height = Math.max(1, Math.floor(bufferSize.y))
    const renderWidth = Math.max(2, Math.floor(fullWidth * (settings.renderWidthPercent / 100)))
    const outerX = Math.floor((fullWidth - renderWidth) / 2)
    const gap = Math.min(renderWidth - 2, Math.floor(settings.centerGapPx * gl.getPixelRatio()))
    const available = Math.max(2, renderWidth - gap)
    const split = settings.stereoSplitPercent / 100
    const leftWidth = Math.max(1, Math.floor(available * split))
    const rightWidth = Math.max(1, available - leftWidth)
    const dividerX = outerX + leftWidth
    const rightX = dividerX + gap

    const originalFocus = camera.focus
    const originalFov = camera.fov
    camera.focus = Math.max(0.05, settings.focusDistanceM * Math.pow(2, settings.convergenceTrim))
    camera.fov = settings.fovDeg
    camera.updateProjectionMatrix()

    stereo.eyeSep = settings.ipdMm / 1000
    // A normal side-by-side render gives each eye half of the original horizontal
    // canvas. This corrects the optical center and was the missing piece in the
    // previous fixed renderer.
    stereo.aspect = 0.5
    stereo.update(camera)

    const lensShift = Math.round((settings.lensCenterOffsetPercent / 100) * Math.min(leftWidth, rightWidth))

    gl.setScissorTest(true)
    gl.setClearColor(0x000000, 1)
    gl.clear(true, true, true)

    const renderEye = (x, width, eyeCamera, shift) => {
      const viewportX = x + shift
      gl.setViewport(viewportX, 0, width, height)
      gl.setScissor(x, 0, width, height)
      gl.render(scene, eyeCamera)
    }

    const leftCamera = settings.stereoscopic ? stereo.cameraL : camera
    const rightCamera = settings.stereoscopic ? stereo.cameraR : camera
    renderEye(outerX, leftWidth, leftCamera, lensShift)
    renderEye(rightX, rightWidth, rightCamera, -lensShift)

    gl.setScissorTest(false)
    gl.setViewport(0, 0, fullWidth, height)

    camera.focus = originalFocus
    camera.fov = originalFov
    camera.updateProjectionMatrix()
  }, enabled ? 1 : 0)

  return null
}
