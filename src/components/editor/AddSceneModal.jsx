import React, { useState } from 'react'
import { generateId } from '../../utils/coords'

export default function AddSceneModal({ onClose, onAdd, uploadImage }) {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  function handleFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (!file) { setError('Choose a panorama image'); return }

    setError('')
    setUploading(true)
    try {
      const url = await uploadImage(file)
      const newScene = {
        id: generateId('scene'),
        title: title.trim(),
        src: url,
        hotspots: [],
      }
      onAdd(newScene)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">Add Scene</h2>
        <form onSubmit={handleSubmit}>
          <label className="modal__label">
            Scene Title
            <input
              className="modal__input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="e.g. Reception"
            />
          </label>

          <label className="modal__label">
            360° Panorama Image (JPEG, PNG or WebP, up to 50 MB)
            <input className="modal__input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} />
          </label>

          {preview && (
            <div className="modal__preview">
              <img src={preview} alt="preview" className="modal__preview-img" />
            </div>
          )}

          {error && <p className="modal__error">{error}</p>}

          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={uploading}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={uploading}>
              {uploading ? 'Uploading…' : 'Add Scene'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
