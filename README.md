# M12Labs Extensions

The official registry of reviewed, signed extension packages for the M12Labs panel. Install them from the panel's admin UI or with `php artisan`.

> [!WARNING]
> Extensions are not sandboxed. Installed PHP runs with the panel's privileges, and installed React runs in the panel's browser origin. Checksums, signatures, path restrictions and the scanner confirm what you install and who published it. They do not make the code safe. Review every package before you install it.

## Available extensions

Browse every current extension at (insert url here). [`registry.json`](registry.json) lists every published version, its supported panel versions and its checksum. All current releases target panel Alpha 4.

## Install an extension

The panel reads this repository's `registry.json` and lists available packages in the admin UI. To install from the command line instead, run these commands from the panel directory as the user that normally runs the panel (usually `www-data`), so rebuilt files keep the correct ownership.

```bash
# Install the latest release by ID
php artisan p:extensions:install minecraft_player_manager

# Install a specific release
php artisan p:extensions:install minecraft_player_manager --release=3.1.0

# Install a local archive
php artisan p:extensions:install /absolute/path/to/minecraft_player_manager.M12LabsExtension --file

# Update an installed extension
php artisan p:extensions:update minecraft_player_manager

# Uninstall an extension
php artisan p:extensions:uninstall minecraft_player_manager --force
```

`install`, `update` and `uninstall` also work as short aliases, for example `php artisan install minecraft_player_manager`. Run `php artisan install` with no arguments in a directory that contains `.M12LabsExtension` files to pick one interactively. Add `--debug` to any of these commands for detailed output.

New extensions are installed **disabled**. Enable each one explicitly in the admin UI after installation.

Uninstalling preserves the extension's database tables. To remove them too, pass `--drop-data`. This rolls back the extension's migrations and cannot be undone.

### What the panel verifies

When it installs a package, the panel:

1. Checks the archive's SHA-256 checksum against `registry.json`.
2. Verifies the release signature against the signing root the panel operator pinned.
3. Asks you to approve the capabilities the package declares, such as routes, pages, database tables and scheduled tasks. The prompt appears wherever you started the install: in the terminal for a CLI install, or in the admin UI.
4. Checks each file against the checksum in the package manifest and copies it into the extension's own directories.
5. Rebuilds the panel frontend.

Unsigned archives are for local development only. The panel installs one only after you type the extension ID to acknowledge it (`--acknowledge-unsigned=<id>`), and an unsigned package cannot declare hooks, queues or permissions marked dangerous.

## Build an extension

Developer documentation, including the extension SDK and the manifest reference, is coming soon at [docs.m12labs.net/developers](https://docs.m12labs.net/developers).

### Repository layout

| Path | Contents |
| --- | --- |
| `extensions/<id>/extension.json` | Source descriptor for the package (manifest v3). |
| `extensions/<id>/files/app/Extensions/Packages/<id>/` | Backend payload. |
| `extensions/<id>/files/frontend/src/extensions/packages/<id>/` | Frontend payload. |
| `packages/<id>/<version>/<id>.M12LabsExtension` | Published archive (a ZIP file with a custom extension). |
| `registry.json` | Every published version with its archive path, checksum and signature. |
| `tools/` | Packaging, scanning, signing and release-check tools. |

The two payload directories are the only places a package can install files. Packages cannot write into core controllers, routes, assets or configuration.

### Packaging commands

Run these from the repository root:

```bash
# Run the scanner and packaging tests
python3 -m unittest discover -s tools/tests -p 'test_*.py' -v

# Scan, build and inspect a package
python3 tools/m12labs_extension_tool.py scan extensions/node_health_history
python3 tools/m12labs_extension_tool.py build extensions/node_health_history
python3 tools/m12labs_extension_tool.py inspect .build/node_health_history/2.1.0/node_health_history.M12LabsExtension

# Publish a signed release and check the whole repository
python3 tools/m12labs_extension_tool.py publish extensions/node_health_history
python3 tools/check_extensions.py
```

- `build` writes only to `.build/`. Without a release key, it produces an unsigned archive for local testing.
- `publish` and `sync` write to `packages/` and update `registry.json`. They refuse to write an unsigned release.
- `build`, `publish` and `sync` all refuse to write an archive when the scanner reports a block finding.

The legacy `tools/publish_extension.py` wrapper runs the same tool.

## Contribute a release

1. Bump `package.version` in `extension.json`. Never overwrite a version that has already been distributed.
2. Run `publish`, then `python3 tools/check_extensions.py`.
3. Commit the source, the new archive and `registry.json` together.
4. Open a pull request that describes the behavior change, the panel versions you tested, any permission or data changes, and your validation results.

The **Extension security gate** CI job must pass before the release is merged or distributed.

## Required CI

The **Extension security gate** job runs on pull requests, pushes and merge queues. It:

- runs the scanner and packaging tests,
- checks every current source against its rebuilt archive,
- verifies every registry checksum and the full signing chain, and
- scans every new or modified release.

Block findings fail the job. Warnings stay visible and need a reviewer's assessment. The gate never has access to a release private key, so a pull request cannot sign anything.

Unmodified historical archives keep their original compatibility contract and checksums. The gate rescans them against current path rules only when they are modified, newly registered or promoted to the current release. Passing the gate does not approve a historical archive for installation on a current panel.

### Maintainer setup

A workflow file cannot configure branch protection, so repository maintainers must:

- select **Extension security gate** as a required status check in the protected branch or ruleset,
- require pull requests, and
- prevent bypass for release changes.

Do not publish a GitHub release or distribute an archive until the check succeeds on that commit. Automated publishing workflows must depend on this gate and must not use `pull_request_target` to run contributor code with secrets.

## License

[GNU General Public License v3.0](LICENSE)
