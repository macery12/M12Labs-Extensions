# M12Labs Extensions Repository

This repository publishes installable M12Labs extension packages.

The panel reads `registry.json`, lists packages in the admin UI, downloads the selected package archive, verifies its SHA-256 checksum, and then installs the declared files before rebuilding the panel.

## Repository Layout

`extensions/<extension-id>/extension.json`
Repository source descriptor for a package version.

`extensions/<extension-id>/files/`
The exact files that should be installed into the panel when the package is installed.

Backend package files must live under `app/Extensions/Packages/<extension-id>/...`.

Frontend package files must live under `resources/scripts/extensions/packages/<extension-id>/...`.

`packages/<extension-id>/<version>/package.zip`
Generated archive that the panel downloads and verifies.

`registry.json`
Generated package index read by the panel.

## Publishing

Build or update a package release with:

```bash
python3 tools/publish_extension.py extensions/server_info
```

The publish script will:

1. Read `extension.json`.
2. Hash every file in `files/`.
3. Generate `m12labs-extension.json` inside a staging directory.
4. Build `packages/<extension-id>/<version>/package.zip`.
5. Update `registry.json` with the latest metadata and archive checksum.

## Package Layout Rules

Packages are intentionally scoped so extension files stay grouped by extension instead of being written into shared roots.

- PHP code, package-local routes, and backend helpers go under `app/Extensions/Packages/<extension-id>/...`
- The client extension UI and any frontend helper files go under `resources/scripts/extensions/packages/<extension-id>/...`
- Client routes should be defined in `app/Extensions/Packages/<extension-id>/routes/client.php`

## Security Model

Checksums in `registry.json` verify archive integrity against this repository manifest.

They do not make package code safe on their own. Any published package can add PHP, routes, and frontend code to M12Labs. Review package contents before publishing them to production repositories.