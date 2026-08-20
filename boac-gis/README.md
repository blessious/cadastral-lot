# GeoLGU Navigator

Mobile-first cadastral mapping for the Municipality of Boac. The production app runs as a Next.js/Node service on the server PC, uses MySQL for authentication and server-ranked parcel search, and remains available through `https://cadmap.41itservices.pro/` behind the existing HTTPS reverse proxy.

## One-time Windows server setup

Requirements:

- A local NTFS Git checkout on branch `main`
- Node.js 20.9.0 or newer, npm, Git, MySQL, and Microsoft Edge
- An elevated Windows account for Scheduled Task registration
- Apache already proxying the configured local `APP_PORT`

From the repository root, run:

```bat
setup_server.bat
```

On its first run, setup creates the ignored `server_config.env` and stops. Edit that file with the server-local MySQL credentials, the canonical public URL, and a unique `AUTH_SECRET` of at least 32 characters, then run setup again. The installer records absolute Node/npm/Git paths, registers the `GeoLGU-CadMap` Scheduled Task as `SYSTEM`, builds an isolated release, migrates and stages search data, verifies it on a temporary port, and activates it only after the checks pass.

Runtime releases, state, and rotating logs are stored under the ignored `.deploy` directory. No runtime metadata is written into tracked application assets.

## Normal server update

Use this exact workflow from a clean checkout:

```bat
git pull --ff-only
update_server.bat
```

The updater requires `main` and a clean tracked worktree. It creates a detached release worktree under `.deploy\releases`, runs locked dependency installation, TypeScript, ESLint, unit/data checks, a production build, database migrations, staged import, API verification, and browser tests at 360, 390, 768, 1024, and desktop widths. The live release remains online during these steps.

Only after the candidate passes does the updater stop the Scheduled Task, atomically swap the search table and release pointer, restart production, and verify both localhost and `PUBLIC_URL`. If activation or health verification fails, it restores the prior search table and prior release automatically. Normal cutover downtime is limited to the stop/swap/start/health window.

To explicitly switch to the previously healthy release:

```bat
rollback_server.bat
```

## Server configuration

Copy `server_config.example.env` only when setting up a new server. Keep `server_config.env` local and never commit it.

Important values include:

- `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`
- `APP_HOST=127.0.0.1`, production `APP_PORT`, and distinct `APP_CANDIDATE_PORT`
- `PUBLIC_URL=https://cadmap.41itservices.pro`
- `AUTH_SECRET` with at least 32 random characters
- `SCHEDULED_TASK_NAME`, health timeout, log retention, and responsive-test browser channel

Create or update an administrator when required:

```bat
cd boac-gis
npm run auth:setup
```

The application never deletes or replaces `gis_users` during map migrations or release rollback.

## Map-data rebuild

ETRACS is not queried at runtime. Cadastral/taxpayer changes continue through the controlled source-file rebuild:

```bat
python build_unified_data.py
```

The rebuild validates/enriches the published GeoJSON, creates stable lot IDs for rebuilt records, regenerates the compact search index and display-only barangay boundaries, and publishes a geometry-inclusive dataset version. Parcel coordinates and CRS are copied unchanged. The generated barangay envelopes are overview aids only and never replace authoritative parcel geometry.

The regular deployment updater imports the rebuilt search index through a staging table and atomically activates it after verification. The previous active table remains available for rollback; `gis_users` is never modified by this lifecycle.

## Application architecture

- The Leaflet map stays mounted while settings, lot details, and intercepted administration overlays open or close.
- Enabled barangays remain logically unlimited, while detailed geometry is viewport-driven at zoom 15+, limited to an eight-barangay browser LRU and two concurrent cancellable requests.
- Lightweight derived barangay boundaries render below detail zoom; labels render only for visible parcels at zoom 18+.
- Search starts at two characters and queries normalized indexed MySQL fields; the browser does not download `search_index.json` during initial navigation.
- Geometry responses contain only map display fields. Complete parcel/taxpayer details are requested only after selection.
- `/api/health` reports release, database, geometry, dataset, row-count, and version-agreement readiness without credentials.
- Authenticated API responses use private cache policy; versioned geometry supports ETags and compression through Next.js and the existing reverse proxy.

## Manual development checks

```bat
cd boac-gis
npm ci
npm run typecheck
npm run lint
npm test
npm run verify:data
npm run build
```

With a production server running and the server configuration loaded:

```bat
npm run verify:release -- --base-url http://127.0.0.1:3005 --target active
npm run test:responsive
```
