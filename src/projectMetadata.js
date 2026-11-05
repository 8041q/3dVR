// Optional descriptive metadata travels with every saved and published snapshot.
export const PROJECT_METADATA_LIMITS = {
  description: 2000,
  author: 200,
  organization: 200,
  contributors: 1000,
  language: 80,
  keywords: 500,
  license: 300,
  rights: 1000,
}

export function normalizeProjectMetadata(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return Object.fromEntries(Object.entries(PROJECT_METADATA_LIMITS).flatMap(([key, limit]) => {
    const text = typeof source[key] === 'string' ? source[key].trim().slice(0, limit) : ''
    return text ? [[key, text]] : []
  }))
}
