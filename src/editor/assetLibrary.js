export function containsAsset(value, url) {
  if (typeof value === 'string') return value === url
  if (Array.isArray(value)) return value.some((item) => containsAsset(item, url))
  return Boolean(value && typeof value === 'object' && Object.values(value).some((item) => containsAsset(item, url)))
}

export function assetUsage(project, url) {
  const usage = []
  for (const scene of project?.scenes || []) {
    if (containsAsset(scene, url)) usage.push({ kind: 'Scene', label: scene.title || scene.id })
  }
  for (const guide of project?.guides || []) {
    if (containsAsset(guide, url)) usage.push({ kind: 'Guide', label: guide.title || guide.id })
  }
  return usage
}

export function filterAssets(assets, { type = 'all', query = '', usage = 'all', sort = 'newest' } = {}, project) {
  const search = query.trim().toLowerCase()
  const visible = assets.filter((asset) =>
    (type === 'all' || asset.type === type)
    && (!search || [asset.name, asset.storedName, asset.extension].some((value) => value?.toLowerCase().includes(search)))
    && (usage === 'all' || (assetUsage(project, asset.url).length > 0) === (usage === 'used')))
  return visible.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true })
    if (sort === 'largest') return b.bytes - a.bytes || a.name.localeCompare(b.name)
    if (sort === 'oldest') return String(a.updatedAt).localeCompare(String(b.updatedAt))
    return String(b.updatedAt).localeCompare(String(a.updatedAt))
  })
}

export async function uploadAssetBatch(files, upload, onChange) {
  const unique = [...new Map([...files].map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file])).values()]
  const queue = unique.map((file) => ({ file, name: file.name, status: 'waiting', error: '' }))
  const report = () => onChange(queue.map((entry) => ({ ...entry })))
  report()
  for (const entry of queue) {
    entry.status = 'uploading'; report()
    try {
      await upload(entry.file)
      entry.status = 'complete'
    } catch (error) {
      entry.status = 'failed'
      entry.error = error.message || 'Upload failed.'
    }
    report()
  }
  return queue
}
