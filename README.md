# 3DVR self-hosted viewer/editor

Self-hosted 360 panorama, WebXR, guided-tour and product-inspection platform intended for company presentations and exhibitions.

## User guide

For normal editor use, start with [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md). It covers projects, scenes, panoramas, hotspots, 3D models, guides, publishing and offline exhibition use without requiring programming knowledge.

## Current capabilities

- One URL viewer for desktop, normal phone, phone-in-plastic-headset and WebXR headsets.
- Separate editor route sharing the same runtime.
- PC / Phone / VR Preview controls.
- Inverted horizontal and vertical desktop look controls.
- Mouse/touch, phone orientation, gaze, XR controllers, keyboard and future remote input through one interaction layer.
- Large 2:1 equirectangular panorama upload using resumable chunks.
- FFmpeg multiresolution cubemap processing.
- Bounded panorama GPU texture cache.
- Explicit project download for offline/exhibition use, separate from ordinary browser cache.
- Offline byte-range responses for downloaded audio/video media.
- Hotspots with ordered reusable actions.
- Scene navigation, information, external-link, model-inspection and start-guide actions.
- First-class guided experiences with ordered steps, scene changes, focus cues, hotspot highlights, narration, hotspot-driven completion and timed progression.
- GLB product inspection with designer-friendly animation controls.
- Material/fabric color variants targeting named GLB materials.
- Selectable model annotations.
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

Individual checks:

```bash
npm run test:phase3
npm run test:phase4
npm run test:phase5
npm run test:phase6
npm run test:model
```

The Phase 3 smoke test requires FFmpeg with `v360`.

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

The current prototype stores editable content in:

```text
server/data/scenes.json
server/data/guides.json
```

This is intentionally retained while the viewer/editor feature model stabilizes. A later persistence/versioning phase should move projects, revisions, users and asset metadata to PostgreSQL/object storage without changing the viewer action/guide schemas.

See `PHASE6.md` for the Phase 6 implementation details and current boundaries.
