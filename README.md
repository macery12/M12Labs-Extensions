# M12Labs Extensions Repository

This repository publishes installable M12Labs extension packages.

The panel reads `registry.json`, lists packages in the admin UI, downloads the selected package archive, verifies its SHA-256 checksum, and then installs the declared files before rebuilding the panel.

For the full contributor workflow, including forking, cloning, authoring files, building or publishing `.M12LabsExtension` packages, testing installs, and opening a pull request, see `docs/creating-an-extension.md`.

## Repository Layout

`extensions/<extension-id>/extension.json`
Repository source descriptor for a package version.

`extensions/<extension-id>/files/`
The exact files that should be installed into the panel when the package is installed.

Backend package files must live under `app/Extensions/Packages/<extension-id>/...`.

Frontend package files must live under `resources/scripts/extensions/packages/<extension-id>/...`.

`packages/<extension-id>/<version>/<extension-id>.M12LabsExtension`
Generated package artifact that the panel downloads and verifies.

`.M12LabsExtension` files are ZIP-compatible archives with a custom extension so they are easier to identify as M12Labs packages.

`registry.json`
Generated package index read by the panel.

## Publishing

Build or update a package release with:

```bash
python3 tools/m12labs_extension_tool.py publish extensions/minecraft_player_manager
```

The legacy wrapper still works:

```bash
python3 tools/publish_extension.py extensions/minecraft_player_manager
```

The publish script will:

1. Read `extension.json`.
2. Hash every file in `files/`.
3. Generate `m12labs-extension.json` inside a staging directory.
4. Build `packages/<extension-id>/<version>/<extension-id>.M12LabsExtension`.
5. Update `registry.json` with the latest metadata and archive checksum.

## Main Repository Tool

The repository now ships a single main tool for extension packaging and debugging:

```bash
python3 tools/m12labs_extension_tool.py <command> [options]
```

Examples:

```bash
python3 tools/m12labs_extension_tool.py build extensions/minecraft_player_manager
python3 tools/m12labs_extension_tool.py publish extensions/minecraft_player_manager
python3 tools/m12labs_extension_tool.py sync extensions/minecraft_player_manager
python3 tools/m12labs_extension_tool.py inspect packages/minecraft_player_manager/1.0.1/minecraft_player_manager.M12LabsExtension
```

`build` writes the staged archive into `.build/<extension-id>/<version>/<extension-id>.M12LabsExtension`.

`publish` and `sync` write the shipped archive into `packages/...` and update `registry.json`.

Add `--debug` to get more detailed output for staging, package creation, manifest contents, and registry updates.

## Manual CLI Installation

The panel now supports easy manual CLI installs in addition to the admin UI.

User-friendly install command:

```bash
php artisan install minecraft_player_manager
```

If you run `php artisan install` inside a directory containing one or more `.M12LabsExtension` files, the command can discover them, warn you, and let you choose one interactively.

Install from the official repository by extension id:

```bash
php artisan p:extensions:install minecraft_player_manager
```

Install a specific release from a configured repository:

```bash
php artisan p:extensions:install minecraft_player_manager --repository=m12labs-official --release=1.0.1
```

Install from a local package artifact:

```bash
php artisan p:extensions:install /absolute/path/to/minecraft_player_manager.M12LabsExtension --file
```

The short alias works too:

```bash
php artisan install /absolute/path/to/minecraft_player_manager.M12LabsExtension --file
```

Uninstall an installed package manually:

```bash
php artisan p:extensions:uninstall minecraft_player_manager --force
```

Or with the short alias:

```bash
php artisan uninstall minecraft_player_manager --force
```

Add `--debug` to install or uninstall for more verbose developer output.

Run these commands as the same user that normally runs the panel, usually `www-data`, so rebuilds do not leave root-owned files behind.

If you do run them as root, the commands now attempt to repair ownership automatically for extension paths, temporary storage, and `public/build` so the panel is left in a safe state.

## Package Layout Rules

Packages are intentionally scoped so extension files stay grouped by extension instead of being written into shared roots.

- PHP code, package-local routes, and backend helpers go under `app/Extensions/Packages/<extension-id>/...`
- The client extension UI and any frontend helper files go under `resources/scripts/extensions/packages/<extension-id>/...`
- Client routes should be defined in `app/Extensions/Packages/<extension-id>/routes/client.php`

## Security Model

Checksums in `registry.json` verify archive integrity against this repository manifest.

They do not make package code safe on their own. Any published package can add PHP, routes, and frontend code to M12Labs. Review package contents before publishing them to production repositories.