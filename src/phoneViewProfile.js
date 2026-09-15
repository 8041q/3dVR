export const PHONE_VIEW_MODES = Object.freeze({
  MAGIC_WINDOW: 'magic-window',
  HEADSET_STEREO: 'headset-stereo',
  DOLLHOUSE: 'dollhouse',
})

export const DEFAULT_PHONE_VIEW_PROFILE = Object.freeze({
  mode: PHONE_VIEW_MODES.MAGIC_WINDOW,
  stereoscopic: true,
  ipdMm: 64,
  focusDistanceM: 10,
  convergenceTrim: 0,
  fovDeg: 75,
  screenWidthMm: 150,
  screenToLensMm: 40,
  renderWidthPercent: 100,
  stereoSplitPercent: 50,
  centerGapPx: 0,
  lensCenterOffsetPercent: 0,
  dollhouseScale: 1,
  touchLookEnabled: true,
})

const STORAGE_KEY = '3dvr-phone-view-profile-v1'

function finite(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function normalizePhoneViewProfile(value = {}) {
  const mode = Object.values(PHONE_VIEW_MODES).includes(value.mode)
    ? value.mode
    : DEFAULT_PHONE_VIEW_PROFILE.mode

  return {
    mode,
    stereoscopic: value.stereoscopic !== false,
    ipdMm: Math.min(90, Math.max(45, finite(value.ipdMm, DEFAULT_PHONE_VIEW_PROFILE.ipdMm))),
    focusDistanceM: Math.min(100, Math.max(0.25, finite(value.focusDistanceM, DEFAULT_PHONE_VIEW_PROFILE.focusDistanceM))),
    convergenceTrim: Math.min(1, Math.max(-1, finite(value.convergenceTrim, DEFAULT_PHONE_VIEW_PROFILE.convergenceTrim))),
    fovDeg: Math.min(120, Math.max(35, finite(value.fovDeg, DEFAULT_PHONE_VIEW_PROFILE.fovDeg))),
    screenWidthMm: Math.min(220, Math.max(90, finite(value.screenWidthMm, DEFAULT_PHONE_VIEW_PROFILE.screenWidthMm))),
    screenToLensMm: Math.min(80, Math.max(20, finite(value.screenToLensMm, DEFAULT_PHONE_VIEW_PROFILE.screenToLensMm))),
    renderWidthPercent: Math.min(100, Math.max(55, finite(value.renderWidthPercent, DEFAULT_PHONE_VIEW_PROFILE.renderWidthPercent))),
    stereoSplitPercent: Math.min(58, Math.max(42, finite(value.stereoSplitPercent, DEFAULT_PHONE_VIEW_PROFILE.stereoSplitPercent))),
    centerGapPx: Math.min(80, Math.max(0, finite(value.centerGapPx, DEFAULT_PHONE_VIEW_PROFILE.centerGapPx))),
    lensCenterOffsetPercent: Math.min(12, Math.max(-12, finite(value.lensCenterOffsetPercent, DEFAULT_PHONE_VIEW_PROFILE.lensCenterOffsetPercent))),
    dollhouseScale: Math.min(2, Math.max(0.35, finite(value.dollhouseScale, DEFAULT_PHONE_VIEW_PROFILE.dollhouseScale))),
    touchLookEnabled: value.touchLookEnabled !== false,
  }
}

export function loadPhoneViewProfile() {
  if (typeof window === 'undefined') return { ...DEFAULT_PHONE_VIEW_PROFILE }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return normalizePhoneViewProfile(raw ? JSON.parse(raw) : DEFAULT_PHONE_VIEW_PROFILE)
  } catch {
    return { ...DEFAULT_PHONE_VIEW_PROFILE }
  }
}

export function savePhoneViewProfile(profile) {
  const normalized = normalizePhoneViewProfile(profile)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    } catch {
      // Storage can be disabled in private/embedded browsers. Runtime settings still work.
    }
  }
  return normalized
}

export function opticalFovEstimateDeg(profile) {
  const normalized = normalizePhoneViewProfile(profile)
  const halfPerEyeWidth = (normalized.screenWidthMm * 0.5) / 2
  return Math.min(120, Math.max(35, (2 * Math.atan(halfPerEyeWidth / normalized.screenToLensMm) * 180) / Math.PI))
}
