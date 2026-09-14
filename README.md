# 3DVR self-hosted viewer/editor

Self-hosted 360 panorama, WebXR and product-inspection platform intended for company presentations and exhibitions.

## Current capabilities

- Desktop, normal phone, phone-in-plastic-headset and WebXR headset viewing from the same URL viewer.
- Separate editor route sharing the same runtime.
- PC / Phone / VR Preview controls.
- Mouse/touch, phone orientation, gaze, XR controllers, keyboard and future remote input through one interaction layer.
- Large 2:1 equirectangular panorama upload using resumable chunks.
- FFmpeg multiresolution cubemap processing.
- Bounded panorama GPU texture cache.
- Explicit project download for offline/exhibition use, separate from normal browser cache.
- Hotspots with ordered actions.
- Scene navigation actions.
- Information actions with an in-world VR panel.
- GLB product inspection with automatic animation-clip controls.
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

Docker runs the web/API and panorama worker as separate restartable services with persistent storage. They are separate services for reliability, but you do not manually run or watch two terminals.

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
npm run test:model
```

The Phase 3 smoke test requires FFmpeg with `v360`.

## Demo product inspection

The sample Room scene contains an `Inspect demo product` hotspot. It loads:

```text
public/demo/product-demo.glb
```

The GLB contains an animation named `Open drawer`, which is detected by the viewer and exposed as an inspection action.

## Project data

The current prototype still stores its editable scene list in:

```text
server/data/scenes.json
```

This is intentionally retained while the viewer/editor feature model stabilizes. A later persistence phase should move project versions, users and assets to PostgreSQL/object storage without changing the viewer action schema.

See `PHASE5.md` for the Phase 5 implementation details and current boundaries.
