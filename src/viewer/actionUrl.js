export function actionUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value, base)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
  } catch {
    // Old tours can contain malformed links. Leave the visitor in the tour.
  }
  return null
}
