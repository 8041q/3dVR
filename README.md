<p align="center">
  <img src="./public/brand/3dvr-portal-v2.svg" width="104" alt="Atria 3DVR spatial portal logo">
</p>

<h1 align="center">Atria 3DVR</h1>

<p align="center">
  <strong>Self-hosted immersive tours, 360° spaces, WebXR experiences, and interactive 3D product stories.</strong>
</p>

<p align="center">
  Build private or public experiences on infrastructure you control — with accounts, project ownership, offline-ready viewing, and no central Atria service.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/USER_GUIDE.md">User guide</a> ·
  <a href="docs/SERVER_SECURITY.md">Server security</a> ·
  <a href="SECURITY.md">Report a vulnerability</a>
</p>

* * *

## How it works

1. The person running the installation initializes one local **owner** account on the server.
2. Owners and invited members create immersive projects from panoramas, 3D models, hotspots, guides, media, and product interactions.
3. Everyone granted access to a project is an equal project owner: they can edit, publish, and manage access.
4. Published tours open in a normal browser, phone headset, or supported WebXR headset. Public visitors do not need an account.

Every installation owns its data, identities, and authentication secret. There is no hosted account service, public registration endpoint, or SMTP requirement.

## Feature highlights

- **Immersive delivery** — one viewer adapts to desktop, phone, phone headset, and WebXR headset use.
- **360° and spatial scenes** — equirectangular panoramas, tracked Blender spatial rooms, fallbacks for non-tracked devices, and fast multi-resolution panorama processing.
- **Purpose-built authoring** — scenes, groups, hotspots, ordered actions, guided tours, scene map, VR preview, draft/published revisions, and review-before-publish.
- **Interactive 3D products** — GLB inspection, animation controls, material/finish variants, annotations, and generated model thumbnails.
- **Project portability** — import/export self-contained project ZIPs with media, history, published releases, and referenced local assets.
- **Account-aware self-hosting** — local owner/member accounts, invitations, optional member MFA, owner-required MFA, session/device controls, suspension, local reset recovery, and staged account deletion.
- **Equal project ownership** — anyone with access is an equal owner; projects survive an account deletion while another owner remains.
- **Built for operations** — persistent storage outside Git, a separate panorama worker, bounded uploads/processes, Docker deployment, and server-side health/usage information.

## Security and account model

The server owner is an installation administrator, not a superior owner of everyone else's project. Project access is deliberately separate from server administration:

- The owner has required authenticator-app MFA. Members can opt into MFA; a successful MFA check remembers that browser for two hours.
- Accounts are created by the server owner. There are no default credentials, public sign-up, or mandatory SMTP configuration.
- Password resets produce a one-time, manually delivered temporary password. The recipient must choose a new password before they can use the app.
- Users can inspect and sign out their own devices. An owner can suspend accounts, but cannot inspect someone else’s device history.
- A scheduled account deletion retains data for 30 days. Signing in cancels it. Shared projects remain available while another project owner exists.
- Auth secrets, databases, media, thumbnails, panorama work, and project snapshots live in the installation’s private runtime storage — not in this repository.

Read [the complete deployment, account, recovery, privacy, and migration guidance](docs/SERVER_SECURITY.md) before exposing an installation to the internet. This project is engineered with security controls, but it is not a substitute for testing your TLS proxy, host permissions, backups, updates, and recovery process.

## Quick start

### Requirements

- Node.js 22.13 or newer
- npm
- FFmpeg with the `v360` filter (for panorama processing)
- Trusted HTTPS for real mobile-sensor and WebXR sessions

```bash
git clone https://github.com/8041q/3dVR.git
cd 3dVR
cp .env.example .env
npm ci
npm run accounts -- init owner@example.com
npm run dev
```

The account command prints a single-use activation link. Open it in the same browser address you will use for the app, choose an owner password, enroll an authenticator app, and continue directly to the workspace.

For HTTPS/LAN headset development:

```bash
npm run dev:https
```

Set `APP_ORIGIN` in `.env` to the browser origin you will actually use. The app derives trusted current-machine addresses dynamically; it does **not** require a fixed LAN IP. HTTPS certificates and public DNS still need to match the hostname used by the browser.

## Production deployment

Build the client, then start the integrated web/API process and panorama worker:

```bash
npm run build
npm start
```

For the managed container deployment:

```bash
docker compose up -d --build
```

The included Compose configuration separates the web/API and panorama worker, mounts persistent runtime storage, drops Linux capabilities, uses non-root containers, and keeps the worker off the network. Put a trusted HTTPS reverse proxy in front of it; [`deploy/Caddyfile.example`](deploy/Caddyfile.example) is a minimal starting point.

Useful configuration lives in [`.env.example`](.env.example):

| Setting | Purpose |
| --- | --- |
| `APP_ORIGIN` | Canonical browser origin for production or local development. |
| `APP_PUBLIC_HOSTS` | Additional hostnames configured on your reverse proxy. |
| `APP_DYNAMIC_HOSTS` | Allow current machine addresses (`1`, the default) or restrict to configured names (`0`). |
| `VR_STORAGE_ROOT` | Private persistent runtime-storage location. |
| `AUTH_SECRET_FILE` | Optional read-only external location for the authentication secret. |
| `GEOIP_DATABASE` | Optional local country/city MMDB for device-location labels; IPs are never sent to a lookup service. |

## Everyday workflow

### Create and publish a tour

1. Sign in and create a project in **Projects**.
2. Add scenes and panoramas, then place hotspots, interactions, guides, or GLB product experiences.
3. Use **Preview** to test the draft on desktop, phone, or VR.
4. Use **Review & publish** when the visitor experience is ready.

Saving a draft never changes the live tour. The public viewer only reads the published snapshot.

### Move or back up a project

Open **Project settings → Export project** to download a `.3dvr.zip`. It contains the project’s drafts, metadata, viewer settings, releases/history, local media, processed panoramas, and referenced assets. Importing the ZIP creates a separate unpublished project; it does not overwrite an existing one.

For command-line migration and validation, see [Project migration backups](docs/SERVER_SECURITY.md#upgrade-existing-data).

## Project structure

```text
src/                 React application, viewer, editor, and account UI
server/              Express API, local identity, project storage, worker services
scripts/             Development, account, import/export, and maintenance commands
public/brand/        Atria 3DVR portal logo and application brand assets
deploy/              Reverse-proxy examples
docs/                User, security, project metadata, and Blender guidance
storage/             Runtime data created by an installation (ignored by Git)
```

## Documentation

- [User guide](docs/USER_GUIDE.md) — authoring, previewing, publishing, and visitor controls.
- [Server security](docs/SERVER_SECURITY.md) — installation, HTTPS, accounts, recovery, device privacy, deletion retention, backup, and migration.
- [Blender spatial scenes](docs/BLENDER_SPATIAL_SCENES.md) — preparing position-tracked WebXR rooms.
- [Project metadata](docs/PROJECT_METADATA.md) — title, author, description, and credits fields.
- [Brand notes](docs/LOGO.md) — logo usage and asset generation.

## Known limitations

- Project owners are equal, but live collaborative editing is not implemented yet. Concurrent saved drafts use revision-conflict protection.
- An authorized visitor can copy media already visible in their browser. Offline access is practical exhibition support, not DRM.
- External media remains controlled by its external host; upload confidential content locally.
- Self-hosting still requires normal server work: secure HTTPS, restrictive storage permissions, operating-system updates, backups, and recovery tests.
- Device location labels are approximate and depend on the local MMDB/proxy/VPN path.

## Development and tests

```bash
npm test
npm run build
```

Use `npm run test:editor` for editor-focused tests. The persistence tests use temporary data and do not alter an installed server.

## Contributing

Contributions are welcome. Please keep changes focused, preserve the existing project/data compatibility guarantees, add or update tests where practical, and document user-facing behavior. Never include production secrets, account databases, private projects, or uploaded assets in an issue or pull request.

## Security

Please do not post credentials, private project data, or working exploits in public issues. See [SECURITY.md](SECURITY.md) for responsible reporting guidance.

## License

This repository does not currently include a license file. Choose and add an appropriate open-source license before distributing or accepting external contributions under defined terms.
