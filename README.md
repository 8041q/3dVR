# 3DVR self-hosted viewer/editor

Self-hosted 360 panorama, WebXR, guided-tour and product-inspection platform intended for company presentations and exhibitions.

## User guide

For normal editor use, start with [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md). For preparing tracked-VR rooms from your existing Blender 360 scenes, use [`docs/BLENDER_SPATIAL_SCENES.md`](docs/BLENDER_SPATIAL_SCENES.md).

## Current capabilities

- One URL viewer with capability-specific rendering for desktop, phone, phone-in-plastic-headset and WebXR headsets.
- Blender spatial-room rendering for position-tracked WebXR: real leaning/crouching/small-step parallax with no panorama loaded for the tracked scene.
- Panorama fallback for desktop, phone and rotation-only/emulated-position VR.
- Shared Blender-authored hotspots with panorama yaw/pitch + spatial 3D positions.
- Separate editor route sharing the same runtime.
- PC / Phone / VR Preview controls.
- Inverted horizontal and vertical desktop look controls.
- Desktop mouse plus phone/headset gaze, XR controllers, keyboard and future remote input through one interaction layer. Phone selection uses a 2-second center-crosshair dwell.
- Large 2:1 equirectangular panorama upload using resumable chunks.
- FFmpeg multiresolution cubemap processing.
- Bounded panorama GPU texture cache.
- Explicit project download for offline/exhibition use, separate from ordinary browser cache.
- Offline byte-range responses for downloaded audio/video media.
- Hotspots with ordered reusable actions.
- Scene navigation, information, external-link, model-inspection and start-guide actions.
- First-class guided experiences with ordered steps, scene changes, focus cues, hotspot highlights, narration, hotspot-driven completion and timed progression.
- GLB product inspection with designer-friendly animation controls.
- Finish presets targeting named GLB materials, with color, textures, roughness and metalness.
- Selectable model annotations.
- Scene groups, draggable scene ordering and a navigation Scene Map derived from hotspot connections.
- Focused ordered action builder for multi-action hotspots.
- Guide steps can open product hotspots and trigger product animations/material variants.
- Generic streamed asset upload for models/media.
- PWA/offline foundation.
- Production client served directly by Express after `npm run build`.
- Docker deployment with a separate managed panorama worker.

## Requirements

- Node.js 22+
- npm
- FFmpeg with the `v360` filter
- trusted HTTPS for real WebXR sessions

## Initial setup

```bash
cp .env.example .env
npm install
```

Set a real editor password in `.env`.

## Development - one command

Normal browser development:

```bash
npm run dev
```

That starts Vite, the Express API and the panorama worker together.

For headset/WebXR testing on the LAN:

```bash
npm run dev:https
```

The headset/browser must trust the development certificate.

Viewer routes:

```text
/
/v/default
```

Editor:

```text
/editor
/editor/default
```

## Production - no open terminals required

Build the browser application:

```bash
npm run build
```

For a simple server installation:

```bash
npm start
```

This one command supervises the web/API process and panorama worker.

For the recommended managed deployment:

```bash
docker compose up -d --build
```

Docker runs the web/API and panorama worker as separate restartable services with persistent storage. They remain separate services for reliability, but you do not manually run or watch two terminals.

Expose the application through trusted HTTPS for WebXR. A minimal Caddy example is in `deploy/Caddyfile.example`.

## Tests

```bash
npm test
```

The test suite now contains two checks that are present in this repository:

```bash
npm run test:repo
npm run test:assets
npm run test:migration
```

`test:repo` checks local imports, package-script targets and project upload references. `test:assets` verifies portable upload naming, numeric collision handling, safe deletion/reference guards and the Blender-room filename mapping. `test:migration` validates export identity and import preflight behavior without copying the large room asset.


### Asset filenames and deletion

Uploaded assets keep a sanitized human-readable filename. If a name already exists, the server allocates predictable numeric variants such as `booth-room-2.glb`, `booth-room-3.glb`, and so on; UUID filenames are not used for upload collisions.

The Asset Library exposes **Delete** only for uploaded assets. Deletion is refused while the asset URL is still present in the current project state, saved draft, published snapshot, legacy project data, or a saved revision. Once references are removed and saved, deleting an asset removes both the file in `public/uploads/` and its `server/data/assets.json` registry entry. Demo assets are never deleted through this endpoint.

## Project migration backups

Uploads and generated panorama data are intentionally not committed to Git. Before moving an installation, export a project bundle:

```bash
npm run export:project -- default ./backups/default-project
```

The bundle includes the project data and every referenced local upload. Legacy UUID-named uploads are exported using their recorded original filename, so the existing room asset appears as `booth-room.glb`. To validate without copying large assets, add `--dry-run`.

Restore the bundle into another checkout with:

```bash
npm run import:project -- ./backups/default-project
```

If the destination already contains that project id, explicitly add `--overwrite`. The importer restores files to the stored URLs expected by the project and restores the original-name metadata.

## Guides

Guides are first-class project data stored in `server/data/guides.json` during the current prototype stage.

A guide contains ordered steps. Each step can:

- select a scene;
- show an instruction;
- guide the desktop camera toward yaw/pitch;
- display an in-world look target for tracked devices;
- highlight a hotspot;
- advance when a specific hotspot is selected;
- auto-open a hotspot on entry;
- play/replay narration audio;
- auto-advance after a configured delay;
- trigger an animation or material variant on an already-open product inspection.

The viewer also exposes a guide launcher. A hotspot can use the `start-guide` action, which is the preferred way to begin a guide from inside VR.

## Product inspection

The sample Room scene contains an `Inspect demo product` hotspot. It loads:

```text
public/demo/product-demo.glb
```

The demo shows:

- a friendly `Open storage` control mapped to the GLB clip `Open drawer`;
- two material color variants;
- a selectable model annotation.

In the editor, use `Scan model` after uploading/entering a GLB URL to discover animation clips and material names. Technical clip names can then be mapped to customer-facing labels.

## Project data

Projects use separate draft and published snapshots under:

```text
server/data/projects/<project-id>/
  meta.json
  draft.json
  published.json
  versions/
```

The public viewer only consumes the published snapshot. Saving a draft therefore cannot change the live exhibition presentation until **Publish** is used. The legacy scene/guide files are retained for automatic bootstrap of the `default` project.

A later infrastructure phase can move these snapshots and asset metadata to PostgreSQL/object storage without changing the viewer action/guide schemas.

## Current editor workflow

The editor uses the task-focused Scenes / Interactions / Guides / Library / Project tool rail. Scenes can be grouped and inspected in a visual navigation map. Hotspot actions are authored as an ordered sequence. Use **Preview** to test the current draft without publishing. After **Publish**, the share dialog provides the public URL and a locally generated QR code. See `docs/USER_GUIDE.md` for the operator workflow.

See `PHASE10.md` for the scene/action/finish-authoring changes and `PHASE12.md` for the current product-inspection architecture.

## Phase 12 highlights

Product inspection now stays inside the current panorama on every device instead of replacing desktop/mobile with a fullscreen model workspace. Pointer/touch users can drag and zoom directly; gaze-only headsets, phone headsets and controller VR use the same in-world Motion / Finishes / Details / View controls. Recenter places the inspection back in front of the visitor without leaving the scene. Phase 11 lighting, loading, animation, compressed-GLB and animated-annotation improvements are retained in the in-scene renderer.


## Phase 15

Phone viewing now includes a live calibration overlay for Magic Window, Headset Stereo and Blender-room Dollhouse preview, with corrected centered stereo projection and a visible 2-second gaze progress ring. See `PHASE15.md` and `docs/USER_GUIDE.md`.
