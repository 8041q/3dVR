import React from 'react'
import { useAuth } from '../../contexts/AuthContext'

export default function EditorToolbar({ placingHotspot, onTogglePlacing, saving, saveError, onSave }) {
  const { logout } = useAuth()

  return (
    <div className="editor-toolbar">
      <button
        className={`btn${placingHotspot ? ' btn--active' : ' btn--secondary'}`}
        onClick={onTogglePlacing}
        title={placingHotspot ? 'Click the panorama to place a hotspot' : 'Enable hotspot placement mode'}
      >
        {placingHotspot ? 'Click to place' : '+ Add Hotspot'}
      </button>

      {saving && <span className="editor-toolbar__status">Saving...</span>}
      {saveError && <span className="editor-toolbar__status editor-toolbar__status--error">{saveError}</span>}

      <button
        className="btn btn--primary btn--sm"
        onClick={onSave}
        disabled={saving}
        title="Save all changes to the server"
      >
        Save
      </button>

      <button className="btn btn--ghost btn--sm editor-toolbar__logout" onClick={logout} title="Exit editor">
        Logout
      </button>
    </div>
  )
}
