# Self-hosted accounts and security

Use Node.js 22.13+; Node 22 and 24 are covered by CI. Each installation has its own account database and secret. No central account service or SMTP is needed. `/account` handles activation, login, MFA, invitations, project creation and sharing. The owner can create and edit their own projects with the same login, and manage accounts and hosting in separate tabs. Owner status does not grant access to other users’ private projects.

## First installation

1. Copy `.env.example` to `.env`. Set `APP_ORIGIN` to the exact HTTPS origin without a trailing slash. Use `http://localhost:5173` for local Vite development.
2. Run `npm ci`, then `npm run accounts -- init owner@example.com` locally on the server.
3. Open the printed single-use link within 15 minutes. Choose a password of 15-128 characters, sign in and enroll an authenticator. Save recovery codes separately. Verification opens owner controls directly.
4. Invite regular accounts from owner controls. Invitation/reset links expire after one hour. Share them through a trusted channel. Manual delivery does not verify ownership of an email address; email is only the account identifier.
5. Build with `npm run build`; serve behind HTTPS. Owner account changes use the current authenticated MFA session, which expires after 12 hours.

Keep activation links out of logs and tickets. Tokens are passed in the URL fragment and removed from the address bar by the activation screen. There are no default passwords or public signup endpoints.

## Upgrade existing data

Stop the web and worker. Back up `server/data`, `public/uploads`, `storage` and `.env` privately, outside the repository. Initialize the owner, then run `npm run accounts -- migrate-data` once. It copies old snapshots/uploads into private runtime storage and refuses overwrites. Assign each old project to the owner or another existing account locally:

```bash
npm run accounts -- assign editor@example.com default
```

Unassigned projects are inaccessible. Assignment defaults to private and preserves published snapshots. The project creator can choose public visibility in Account / Sharing. Imports and copies become new private projects. Remove `EDITOR_PASSWORD` from configuration; old bearer tokens are invalid.

After verifying migration, retain the private backup and remove obsolete source-directory runtime files. Legacy snapshots are already tracked: `.gitignore` cannot untrack them or erase old history. Review the release index and history before publishing GitHub source. This implementation deliberately does not rewrite history or delete existing content.

## Production hosting

Compose binds Node to host loopback. Run Caddy on the host using `deploy/Caddyfile.example`; only HTTPS through Caddy should be public. Node trusts loopback proxies. Do not expose the container directly through another network path. Use a dedicated hostname.

Initialize local storage before starting Compose. On Linux, grant container UID/GID 1000 access to runtime directories. Restrict `storage/security` and its secret to that user. On Windows use NTFS ACLs; POSIX modes alone cannot enforce Windows permissions. Optionally use `AUTH_SECRET_FILE` with a read-only mounted secret. Never mount the security directory into the worker.

Containers use non-root users, read-only image filesystems, dropped capabilities and CPU/memory/PID limits. The panorama worker has no network or account secrets. Web-side probes still run locally and need security updates. Validate image execution on the deployment host; Compose validation alone is not a container smoke test.

Defaults: web 2 GiB RAM; worker 4 GiB; uploads 2 GiB; panorama dimensions 32768x16384; probes 30 seconds; panorama commands 15 minutes; thumbnail queue 20 with two active processes; one active upload per account; one active import per web process. Account source-media reservations default to 50 GiB (`USER_STORAGE_QUOTA_BYTES`). ZIP limits are 10 GiB compressed and 20 GiB extracted. Abandoned panorama uploads expire after 24 hours. Generated panorama output and retained history can add disk usage beyond source-media reservations. Monitor filesystem capacity as well as app limits.

## Project access and exhibition offline mode

Creators manage visibility and sharing. Editors can edit and publish. Viewers receive only published content. Drafts, versions, libraries, uploads, jobs, thumbnails and exports enforce permissions. Public visitors receive only media referenced by public publications. External media remains governed by its external host; upload locally when confidentiality matters.

Offline viewing saves a viewer presentation, separately from exporting an editable project. Private copies belong to the account that authorized them. Logout/account switching clears private copies. Network failures allow exhibition playback; authorization failures do not. A disconnected device learns about revocation only on reconnect. This is not DRM: an authorized viewer or someone controlling the browser/device can copy visible media. Already public/downloaded content cannot be recalled.

## Recovery, backups and updates

Regular users reset passwords with an owner-generated link. Password resets revoke sessions and retain MFA. For an owner recovery, stop the web process and run locally:

```bash
npm run accounts -- recover owner@example.com
```

This revokes owner sessions, temporarily blocks the old credentials and prints a replacement activation link. The owner identity and project ownership are preserved. Enroll MFA again. There is no HTTP owner-recovery endpoint.

For consistent backups, stop web and worker and copy all of `storage` plus any external auth secret. Restore them together with matching code, preserving permissions. Test on an isolated host. Losing the authentication secret makes encrypted MFA secrets unrecoverable; local recovery can restore owner access.

Run `npm ci`, `npm audit`, tests and the build for updates. Run `npm run accounts -- migrate` locally when auth schemas change. Back up before migration; roll back using matching code/database backups. Keep logs private and never log cookies, invitation tokens or request bodies. The owner screen reports free disk, configured quota, active sessions and account/sharing audit events.

This work is not an independent penetration test or ASVS certification. Test actual TLS/proxy behavior, container permissions, exhaustion behavior and backup recovery on the target server before recommending public internet deployment.

## Node runtime compatibility

The SQLite driver is pinned to `better-sqlite3` 13.0.3, which uses Node-API binaries rather than a binary tied to one Node module ABI. Existing account databases and authentication secrets do not need replacement for this dependency update.

If an older installation reports `NODE_MODULE_VERSION` or `ERR_DLOPEN_FAILED`, run `npm ci` with the Node version you intend to use, then retry the command. This replaces dependencies from the lockfile without deleting account data. Do not delete `storage` or regenerate the authentication secret to fix a native-module loading error.

## HTTPS development and activation links

For `npm run dev:https`, set `APP_ORIGIN=https://localhost:5173` in `.env` before creating activation links. The regular development command also honors an explicitly configured HTTPS origin. Restart the development group after changing `.env`.

You can also generate an HTTPS activation link with `npm run accounts -- init owner@example.com --https`. Run `npm run dev:https` with the same hostname and port. The activation page lets you set your password; the email identifier alone does not create a password or let you log in. If an unused setup link expires, rerun `init`; do not use `recover` unless an owner account has already been activated.

For LAN access, configure the exact HTTPS address you will use on the device before generating the link. A development certificate must be trusted by that browser/device. Vite refuses to move silently to another port because that would invalidate the configured authentication origin.

## Authenticator setup

MFA uses a time-based code generated by an authenticator app on your phone; it does not send email and does not require SMTP. In the owner setup screen, confirm your account password, scan the displayed QR code (or enter the manual setup key), save recovery codes, then enter the app's six-digit code. After successful owner enrollment, earlier unverified sessions are revoked while the verified session continues directly into owner controls.

The account area separates Projects / Project access / Security for regular accounts with additional Users / Server tabs for owners. Owner status, invitations and user management stay available throughout the authenticated MFA session. There is no separate five-minute sign-in limit; expired or revoked sessions remain blocked.

## Workspace entry and LAN sign-in

The root URL `/` and `/account` open the workspace. Before local initialization, the page explains the server command. After initialization, paste the activation link or code into that same page; it can be used on a different device without navigating to localhost. New account activation signs in automatically, and successful authenticator enrollment continues into owner controls. Public and private visitor tours use `/v/<project-id>`.

Trusted machine addresses are derived from current OS interfaces for every request, using the configured frontend scheme and port, in both development and production. IP changes do not require editing the application. Use `APP_ORIGIN`, optional `APP_PUBLIC_HOSTS` (configured reverse-proxy hostnames), and optional `APP_TRUSTED_ORIGINS` for deployment names. Set `APP_DYNAMIC_HOSTS=0` if an installation should accept configured names only. Request headers never grant new trusted origins. Invitation URLs returned by the API are relative; the browser builds a shareable link from its current address. HTTPS certificates and public DNS still belong to the server/proxy configuration; changing an IP does not make an invalid certificate valid.


MFA is mandatory for the owner and optional for members. Invitation and password-reset forms do not promise an authenticator step; only owner setup requires it. Successful MFA at sign-in remembers that browser for two hours using a signed HttpOnly cookie backed by a server verification record. Password sign-ins rotate the token without extending its original deadline. Password resets, password changes, MFA changes, suspensions and device revocations clear trusted-device records. The grace period applies to password re-login; an existing valid 12-hour session continues normally.

Model thumbnails are generated serially in the signed-in editor, including uncached existing models and new GLB uploads. New uploads use the selected local file for rendering. The server validates and re-encodes captures, restricts them to authorised source assets, and caches WebP files outside public storage. Thumbnail writes are limited to 120 per minute per IP and 256 KiB per request; the encoding queue remains bounded.
