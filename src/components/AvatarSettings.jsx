import React, { useEffect, useRef, useState } from 'react'
import { useAuth, accountRequest } from '../contexts/AuthContext'
import { Avatar, Notice, PanelHeading } from './accountUi'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const SOURCE_MAX_BYTES = 5 * 1024 * 1024 // largest file a person can pick
const OUTPUT_PIXELS = 256                 // what is actually uploaded
const MIN_PIXELS = 64

// Crops the picture to a centred square, resizes it and re-encodes it. Uploading
// the result keeps files tiny and strips camera metadata such as location.
async function squarePhoto(file) {
  let bitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  catch { bitmap = await createImageBitmap(file) }
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    if (side < MIN_PIXELS) throw new Error(`Choose a photo that is at least ${MIN_PIXELS} × ${MIN_PIXELS} pixels.`)
    const size = Math.min(OUTPUT_PIXELS, side)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9))
    if (!blob || !ACCEPTED_TYPES.includes(blob.type)) throw new Error('This photo could not be processed. Try another image.')
    return blob
  } finally { bitmap.close?.() }
}

export default function AvatarSettings({ onMessage = () => {} }) {
  const auth = useAuth(), input = useRef(null)
  const [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const hasPhoto = Boolean(auth.user.avatarUrl)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])

  async function choose(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(''); onMessage('')
    if (!ACCEPTED_TYPES.includes(file.type)) return setError('Use a JPEG, PNG or WebP image.')
    if (file.size > SOURCE_MAX_BYTES) return setError(`Choose an image up to ${SOURCE_MAX_BYTES / 1024 / 1024} MB.`)
    setBusy(true)
    try {
      const blob = await squarePhoto(file)
      setPreview({ blob, url: URL.createObjectURL(blob) })
    } catch (failure) { setError(failure.message || 'This image could not be read.') }
    finally { setBusy(false) }
  }

  async function save() {
    if (!preview || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/accounts/me/avatar', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': preview.blob.type }, body: preview.blob })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Could not save your photo.')
      setPreview(null)
      await auth.refresh()
      onMessage('Profile photo updated.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  async function remove() {
    if (busy) return
    setBusy(true); setError(''); onMessage('')
    try {
      await accountRequest('/api/accounts/me/avatar', null, 'DELETE')
      await auth.refresh()
      onMessage('Profile photo removed.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  return <section className="account-panel" aria-labelledby="avatar-heading">
    <PanelHeading id="avatar-heading" title="Profile photo" description="Optional. Shown next to your name in the header." />
    <div className="account-avatar-settings">
      <Avatar name={auth.user.name || auth.user.email} src={preview ? preview.url : auth.user.avatarUrl} size={96} />
      <div className="account-avatar-settings__body">
        <Notice error>{error}</Notice>
        <div className="account-actions">
          <input ref={input} type="file" accept={ACCEPTED_TYPES.join(',')} style={{ display: 'none' }} onChange={choose} />
          {preview
            ? <>
                <button type="button" className="account-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save photo'}</button>
                <button type="button" disabled={busy} onClick={() => setPreview(null)}>Cancel</button>
              </>
            : <>
                <button type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Preparing…' : hasPhoto ? 'Change photo' : 'Upload photo'}</button>
                {hasPhoto && <button type="button" disabled={busy} onClick={remove}>Remove photo</button>}
              </>}
        </div>
        <p className="account-help">{preview ? 'Preview only. Your photo isn’t saved until you select Save photo.' : `JPEG, PNG or WebP, up to ${SOURCE_MAX_BYTES / 1024 / 1024} MB. It’s cropped to a square and resized to ${OUTPUT_PIXELS} × ${OUTPUT_PIXELS}.`}</p>
      </div>
    </div>
  </section>
}
