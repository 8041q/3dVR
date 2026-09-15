import React, { useRef, useState } from 'react'

function basename(value = '') {
  return String(value).split(/[\\/]/).pop()
}

function validateManifest(value) {
  if (!value || value.kind !== '3dvr-blender-spatial-scene') {
    throw new Error('This JSON is not a 3DVR Blender spatial-scene export.')
  }
  if (Number(value.schemaVersion) !== 1) {
    throw new Error(`Unsupported Blender spatial-scene schema: ${value.schemaVersion}`)
  }
  if (!value.roomFile) throw new Error('The spatial-scene JSON does not name a room GLB.')
  if (!Array.isArray(value.hotspots)) value.hotspots = []
  for (const hotspot of value.hotspots) {
    if (!Array.isArray(hotspot.spatialPosition) || hotspot.spatialPosition.length !== 3) {
      throw new Error(`Blender hotspot ${hotspot.id || hotspot.label || 'unknown'} is missing spatialPosition.`)
    }
  }
  return value
}

export default function SpatialSceneImporter({ uploadAsset, onApply, configured }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')

  async function importFiles(fileList) {
    const files = [...(fileList || [])]
    if (!files.length) return
    setBusy(true)
    setError('')
    setSummary('')

    try {
      const jsonFile = files.find((file) => /\.json$/i.test(file.name))
      if (!jsonFile) throw new Error('Select the scene.3dvr.json file and room.glb together.')

      const manifest = validateManifest(JSON.parse(await jsonFile.text()))
      const expectedRoom = basename(manifest.roomFile)
      const roomFile = files.find((file) => basename(file.name) === expectedRoom)
        || files.find((file) => /\.glb$/i.test(file.name))

      if (!roomFile) {
        throw new Error(`The export expects ${expectedRoom}. Select the JSON and room GLB together.`)
      }

      const uploaded = await uploadAsset(roomFile)
      if (!uploaded?.url) throw new Error('The room GLB upload did not return a URL.')

      onApply?.({
        spatial: {
          schemaVersion: 1,
          source: 'blender',
          roomUrl: uploaded.url,
          roomFile: expectedRoom,
          manifestFile: basename(jsonFile.name),
          coordinateSystem: manifest.coordinateSystem || '',
          storedRoomFile: uploaded.storedName || uploaded.filename || '',
          sourceScene: manifest.sourceScene || '',
          cameraHeight: Number(manifest.cameraHeight) || null,
          bounds: manifest.bounds || null,
          exportedAt: manifest.exportedAt || null,
          animations: Array.isArray(manifest.animations) ? manifest.animations : [],
          environmentIntensity: 0.85,
          exposure: 1,
        },
        hotspots: manifest.hotspots || [],
      })

      setSummary(
        `${roomFile.name} imported with ${(manifest.hotspots || []).length} Blender hotspot${(manifest.hotspots || []).length === 1 ? '' : 's'} and ${(manifest.animations || []).length} room animation${(manifest.animations || []).length === 1 ? '' : 's'}.`,
      )
    } catch (importError) {
      setError(importError.message || 'Could not import the Blender spatial scene.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="spatial-importer">
      <div className="editor-subheading">Tracked VR room</div>
      <p className="muted">
        Import the room GLB and its 3DVR JSON together. Tracked VR uses this room instead of downloading the panorama.
      </p>
      <div className="button-row">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Importing...' : configured ? 'Replace Blender room' : 'Import Blender room'}
        </button>
        {configured && <span className="status-pill status-pill--success">Spatial room configured</span>}
      </div>
      <input
        ref={inputRef}
        hidden
        multiple
        type="file"
        accept=".json,application/json,.glb,model/gltf-binary"
        onChange={(event) => importFiles(event.target.files)}
      />
      {summary && <div className="success-text">{summary}</div>}
      {error && <div className="error-text">{error}</div>}
    </div>
  )
}
