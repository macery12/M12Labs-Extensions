# Creating and Publishing an Extension

This guide covers the full workflow for contributing an extension to the M12Labs extension repository:

1. Fork the repository.
2. Clone your fork.
3. Create a branch.
4. Build the extension source tree.
5. Publish the package artifact and update the registry.
6. Test install and uninstall locally.
7. Commit the generated files.
8. Open a pull request.

The examples below assume:

- the panel repository lives at `/var/www/jexactyl`
- the extensions repository lives at `/var/www/M12Labs-Extensions`
- your new extension id is `example_extension`

If your directories differ, replace those paths with your own.

## What This Repository Stores

This repository does not store a Laravel package or a Composer package.

It stores installable extension payloads for the panel.

Each extension has:

- a source descriptor: `extensions/<extension-id>/extension.json`
- a source files directory: `extensions/<extension-id>/files/`
- a generated package artifact: `packages/<extension-id>/<version>/<extension-id>.M12LabsExtension`
- an entry in `registry.json`

When an admin installs an extension from the panel:

1. the panel reads `registry.json`
2. it downloads the selected package artifact
3. it verifies the archive SHA-256 checksum
4. it verifies each file checksum declared inside the package manifest
5. it copies the files into the allowed panel directories
6. it rebuilds the panel
7. it records the installed files so uninstall can reverse them later

## Allowed Install Paths

Extensions are intentionally sandboxed to extension-scoped paths.

Your package files may only install into these two roots:

- `app/Extensions/Packages/<extension-id>/...`
- `resources/scripts/extensions/packages/<extension-id>/...`

That means:

- backend PHP, controllers, requests, services, and package-local route files go in `app/Extensions/Packages/<extension-id>/...`
- frontend React and TypeScript files go in `resources/scripts/extensions/packages/<extension-id>/...`

If your package tries to install outside those prefixes, the panel will reject it.

## Before You Start

You need:

- a GitHub account
- a fork the repository
- `git`
- `python3`
- access to a local panel if you want to test installs before opening a PR

Optional but strongly recommended:

- a local clone of the panel repository next to the extensions repo
- a working panel admin account so you can install the extension through the UI

## Fork and Clone the Repository

Fork the repository on GitHub, then clone your fork.

Example:

```bash
git clone git@github.com:YOUR_GITHUB_USERNAME/M12Labs-Extensions.git
cd M12Labs-Extensions
git remote add upstream git@github.com:macery12/M12Labs-Extensions.git
git fetch upstream
git checkout -b add-example-extension upstream/main
```

If you prefer HTTPS:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/M12Labs-Extensions.git
cd M12Labs-Extensions
git remote add upstream https://github.com/macery12/M12Labs-Extensions.git
git fetch upstream
git checkout -b add-example-extension upstream/main
```

Use one feature branch per extension or per release.

## Decide How You Are Starting

There are two common ways to create a package.

### Option 1: Start From Scratch

Choose this when you are building a brand new extension.

You will create:

- `extension.json`
- backend PHP files
- package-local client routes
- frontend files
- `meta.json`

### Option 2: Package Existing Panel Code

Choose this when you already wrote extension code in a local panel checkout and want to move it into the repo.

Typical sources are:

- package-managed backend files from `/var/www/jexactyl/app/Extensions/Packages/<extension-id>/`
- package-managed frontend files from `/var/www/jexactyl/resources/scripts/extensions/packages/<extension-id>/`
- older bundled route files from `/var/www/jexactyl/routes/extensions/client/<extension-id>.php`
- older bundled frontend files from `/var/www/jexactyl/resources/scripts/components/server/extensions/...`

When migrating old bundled code, move it into the package layout and update imports and namespaces to match the package path.

## Create the Extension Source Tree

Create this structure:

```text
extensions/example_extension/
  extension.json
  files/
    app/
      Extensions/
        Packages/
          example_extension/
            Http/
              Controllers/
                ExampleExtensionController.php
            routes/
              client.php
    resources/
      scripts/
        extensions/
          packages/
            example_extension/
              index.tsx
              meta.json
```

You can create the folders with:

```bash
mkdir -p extensions/example_extension/files/app/Extensions/Packages/example_extension/Http/Controllers
mkdir -p extensions/example_extension/files/app/Extensions/Packages/example_extension/routes
mkdir -p extensions/example_extension/files/resources/scripts/extensions/packages/example_extension
```

## Write extension.json

This file describes the package version, UI metadata, default settings, and compatible panel versions.

The generated `.M12LabsExtension` file is still a ZIP-compatible archive internally. It just uses an M12Labs-specific file extension.

Example `extensions/example_extension/extension.json`:

```json
{
  "package": {
    "id": "example_extension",
    "version": "1.0.0"
  },
  "extension": {
    "id": "example_extension",
    "name": "Example Extension",
    "description": "A minimal example extension that adds a server page and a client API route.",
    "author": "M12Labs",
    "icon": "puzzle",
    "route": "example_extension",
    "settingsSchema": [
      {
        "key": "message",
        "label": "Default Message",
        "type": "text",
        "placeholder": "Hello from M12Labs",
        "help": "Shown on the example page if no custom value is returned by the backend."
      }
    ],
    "defaults": {
      "enabled": false,
      "allowedNests": [],
      "allowedEggs": [],
      "settings": {
        "message": "Hello from M12Labs"
      }
    }
  },
  "compatiblePanelVersions": [
    "2.0.0-Rc2.6"
  ]
}
```

Important rules:

- `package.id` and `extension.id` should match
- `package.version` is the release version you are publishing
- bump the version for each new release
- `route` is the client-side route slug under `/extensions/<route>`
- `compatiblePanelVersions` should include the exact panel versions this package supports

## Add the Backend Route File

Create `extensions/example_extension/files/app/Extensions/Packages/example_extension/routes/client.php`:

```php
<?php

use Everest\Extensions\Packages\example_extension\Http\Controllers\ExampleExtensionController;
use Illuminate\Support\Facades\Route;

Route::group(['prefix' => '/example_extension', 'middleware' => ['extensions.access:example_extension']], function () {
    Route::get('/', [ExampleExtensionController::class, 'index']);
});
```

Why this works:

- the panel loads package route files from `app/Extensions/Packages/*/routes/client.php`
- the route is nested under the server client API
- the `extensions.access:<extension-id>` middleware keeps it gated like other extensions

## Add a Minimal Controller

Create `extensions/example_extension/files/app/Extensions/Packages/example_extension/Http/Controllers/ExampleExtensionController.php`:

```php
<?php

namespace Everest\Extensions\Packages\example_extension\Http\Controllers;

use Everest\Models\Server;
use Illuminate\Http\JsonResponse;

class ExampleExtensionController
{
    public function index(Server $server): JsonResponse
    {
        return new JsonResponse([
            'object' => 'extension_example_extension',
            'attributes' => [
                'server' => [
                    'name' => $server->name,
                    'uuid' => $server->uuid,
                ],
                'panelVersion' => (string) config('app.version'),
                'message' => 'Hello from Example Extension',
            ],
        ]);
    }
}
```

This is intentionally small. Real extensions usually add request classes, service classes, and permission checks.

## Add Frontend Metadata

Create `extensions/example_extension/files/resources/scripts/extensions/packages/example_extension/meta.json`:

```json
{
  "id": "example_extension",
  "route": "example_extension"
}
```

The frontend loader uses this file to discover package routes.

## Add a Minimal Frontend Page

Create `extensions/example_extension/files/resources/scripts/extensions/packages/example_extension/index.tsx`:

```tsx
import { useEffect, useState } from 'react';
import http from '@/api/http';
import { ServerContext } from '@/state/server';

type ResponseData = {
    attributes: {
        server: {
            name: string;
            uuid: string;
        };
        panelVersion: string;
        message: string;
    };
};

export default function ExampleExtensionPage() {
    const uuid = ServerContext.useStoreState(state => state.server.data!.uuid);
    const [message, setMessage] = useState('Loading...');

    useEffect(() => {
        http.get<ResponseData>(`/api/client/servers/${uuid}/extensions/example_extension`).then(({ data }) => {
            setMessage(data.attributes.message);
        });
    }, [uuid]);

    return (
        <div className={'p-6'}>
            <h2 className={'text-2xl font-semibold text-white'}>Example Extension</h2>
            <p className={'mt-3 text-neutral-300'}>{message}</p>
        </div>
    );
}
```

This is the minimum useful frontend example:

- it loads as a server extension page
- it calls the package client API route
- it renders returned data

## How To Copy Files From an Existing Extension

If the extension already exists in your local panel checkout, copy the files into the repo using the exact install paths they should land in.

### Copy an Already Package-Managed Extension

If the panel already has:

- `/var/www/jexactyl/app/Extensions/Packages/example_extension/`
- `/var/www/jexactyl/resources/scripts/extensions/packages/example_extension/`

You can copy them into the repo like this:

```bash
mkdir -p extensions/example_extension/files/app/Extensions/Packages/example_extension
mkdir -p extensions/example_extension/files/resources/scripts/extensions/packages/example_extension

cp -a /var/www/jexactyl/app/Extensions/Packages/example_extension/. \
  extensions/example_extension/files/app/Extensions/Packages/example_extension/

cp -a /var/www/jexactyl/resources/scripts/extensions/packages/example_extension/. \
  extensions/example_extension/files/resources/scripts/extensions/packages/example_extension/
```

Then create or update `extensions/example_extension/extension.json`.

### Migrate an Older Bundled Extension

If the extension still lives in older bundled locations, copy the old files and move them into the package layout.

Example sources:

- route file: `/var/www/jexactyl/routes/extensions/client/example_extension.php`
- frontend page: `/var/www/jexactyl/resources/scripts/components/server/extensions/...`
- controller or request classes wherever they currently live in the panel app

Example migration commands:

```bash
mkdir -p extensions/example_extension/files/app/Extensions/Packages/example_extension/routes
mkdir -p extensions/example_extension/files/resources/scripts/extensions/packages/example_extension

cp /var/www/jexactyl/routes/extensions/client/example_extension.php \
  extensions/example_extension/files/app/Extensions/Packages/example_extension/routes/client.php
```

After copying, you usually need to fix:

- PHP namespaces so they point at `Everest\Extensions\Packages\example_extension\...`
- controller imports used by `routes/client.php`
- frontend imports so they point at files inside the new package folder
- route prefixes and `meta.json` ids so they match the extension id

## Publish the Package

Once the source tree is ready, run the publisher from the repository root.

```bash
cd /var/www/M12Labs-Extensions
python3 tools/m12labs_extension_tool.py publish extensions/example_extension
```

Compatibility wrapper:

```bash
python3 tools/publish_extension.py extensions/example_extension
```

The publisher will:

1. read `extension.json`
2. copy the files into `.build/<extension-id>/<version>/`
3. calculate SHA-256 hashes for every file
4. generate `m12labs-extension.json`
5. build `packages/<extension-id>/<version>/<extension-id>.M12LabsExtension`
6. calculate the archive SHA-256
7. update `registry.json`

## Main Repository Tool

The repository now has one main tool for packaging tasks:

```bash
python3 tools/m12labs_extension_tool.py <command> [options]
```

Common examples:

```bash
python3 tools/m12labs_extension_tool.py build extensions/example_extension
python3 tools/m12labs_extension_tool.py publish extensions/example_extension
python3 tools/m12labs_extension_tool.py sync extensions/example_extension
python3 tools/m12labs_extension_tool.py inspect packages/example_extension/1.0.0/example_extension.M12LabsExtension
```

`build` writes a staged archive into `.build/<extension-id>/<version>/<extension-id>.M12LabsExtension` without touching `registry.json`.

`publish` and `sync` update both `packages/...` and `registry.json`.

Use `--debug` when you want more detail about staged files, generated artifacts, registry updates, or manifest contents.

You should then see changes like:

- `extensions/example_extension/...`
- `packages/example_extension/1.0.0/example_extension.M12LabsExtension`
- `registry.json`

## Inspect What the Publisher Generated

Check the generated package and registry entry:

```bash
find packages/example_extension -type f | sort
grep -n "example_extension" registry.json
```

If you want to inspect the staged package contents before pushing:

```bash
find .build/example_extension/1.0.0 -type f | sort
```

Do not hand-edit the generated package file.

If you change source files or metadata, re-run the publish command instead.

## Test the Extension Locally

If your local panel checkout sits next to the extensions repo, publish your package and let the panel read the official
repository manifest from GitHub.

The official repository now boots from
`https://raw.githubusercontent.com/macery12/M12Labs-Extensions/refs/heads/main/registry.json` unless you explicitly
override it with `M12LABS_EXTENSIONS_MANIFEST_URL`.

### Test Through the Admin UI

1. publish the extension in the repo
2. open the panel admin extensions page
3. verify the package appears in the catalog
4. click Install
5. open a compatible server
6. verify the extension page loads and the API works
7. click Uninstall and verify the files are removed again

### Test Through a Local CLI Script

If you want a non-interactive smoke test:

```bash
cd /var/www/jexactyl

runuser -u www-data -- php <<'PHP'
<?php
require 'vendor/autoload.php';

$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$repo = Everest\Models\ExtensionRepository::query()
    ->where('slug', Everest\Services\Extensions\ExtensionRepositoryBootstrapService::OFFICIAL_REPOSITORY_SLUG)
    ->firstOrFail();

$installer = $app->make(Everest\Services\Extensions\ExtensionPackageInstallService::class);
$uninstaller = $app->make(Everest\Services\Extensions\ExtensionPackageUninstallService::class);

$package = $installer->install('example_extension', $repo->id);
echo "installed: {$package->extension_id}:{$package->installed_version}\n";

$uninstaller->uninstall('example_extension');
echo "uninstalled: example_extension\n";
PHP
```

Run install and uninstall as `www-data` so you test the real web-user path.

## Manual CLI Commands

The panel also ships easy Artisan commands for manual installs and removals.

Run these commands as the same user that runs the panel in production, usually `www-data`.

The short user-friendly install command is:

```bash
cd /var/www/jexactyl
php artisan install example_extension
```

If you run `php artisan install` from a directory that contains `.M12LabsExtension` files, the command can discover them, warn you about what it found, and let you choose one interactively.

If there is one local package file, it can offer to install that file.

If there are multiple local package files, it can let you select one, enter a path manually, or cancel.

Install from the official repository:

```bash
cd /var/www/jexactyl
php artisan p:extensions:install example_extension
```

Install a specific version from a specific repository:

```bash
cd /var/www/jexactyl
php artisan p:extensions:install example_extension --repository=m12labs-official --release=1.0.0
```

Short alias:

```bash
cd /var/www/jexactyl
php artisan install example_extension --repository=m12labs-official --release=1.0.0
```

Install from a local package file:

```bash
cd /var/www/jexactyl
php artisan p:extensions:install /var/www/M12Labs-Extensions/packages/example_extension/1.0.0/example_extension.M12LabsExtension --file --label="Local build"
```

Short alias:

```bash
cd /var/www/jexactyl
php artisan install /var/www/M12Labs-Extensions/packages/example_extension/1.0.0/example_extension.M12LabsExtension --file --label="Local build"
```

Uninstall from the CLI:

```bash
cd /var/www/jexactyl
php artisan p:extensions:uninstall example_extension --force
```

Short alias:

```bash
cd /var/www/jexactyl
php artisan uninstall example_extension --force
```

Add `--debug` to install or uninstall for more verbose developer-oriented output.

If you run the commands as root, they now attempt to repair ownership on the extension directories and `public/build` automatically when the command finishes.

## Common Problems

### The package does not show in the panel

Check:

- you ran the publish command
- `registry.json` contains the package entry
- the panel can read the local or remote manifest
- the repository is enabled in the admin UI

### The install is rejected as unsafe

Check the file paths in the package.

Every installed file must begin with one of:

- `app/Extensions/Packages/<extension-id>/`
- `resources/scripts/extensions/packages/<extension-id>/`

### The frontend page does not show up

Check:

- `meta.json` exists
- `index.tsx` exists in the same package folder
- the `id` and `route` values match your extension id
- the panel rebuild completed successfully

### The backend route does not work

Check:

- your package contains `app/Extensions/Packages/<extension-id>/routes/client.php`
- the route imports the correct controller namespace
- the controller file is installed under the matching package namespace

### Install or rebuild fails after you tested as root

If you manually ran the panel build as root, generated assets can become root-owned. Return them to the web user before retesting install or uninstall:

```bash
chown -R www-data:www-data /var/www/jexactyl/public/build
```

## Versioning a New Release

When you change an extension after it was already published:

1. update the source files
2. bump `package.version` in `extension.json`
3. re-run the publish script
4. commit the new zip and updated registry entry

Example:

```bash
python3 tools/m12labs_extension_tool.py publish extensions/example_extension
git status --short
```

If you do not bump the version, you overwrite the same release entry instead of publishing a new one.

## Commit and Push Your Work

Commit both the source files and the generated artifacts.

Example:

```bash
git add extensions/example_extension packages/example_extension registry.json docs/creating-an-extension.md README.md
git commit -m "Add example_extension package"
git push -u origin add-example-extension
```

Do not commit only the source tree and forget the generated package artifact and registry update.

The repository needs all of these:

- the extension source directory
- the generated archive in `packages/...`
- the updated `registry.json`

## Open the Pull Request

Open a PR from your fork to the upstream repository.

Your PR should include:

- what the extension does
- the extension id and version
- the panel versions listed in `compatiblePanelVersions`
- whether you tested install and uninstall locally
- screenshots if the extension adds a UI page
- any migration notes if this replaces bundled code

Example PR title:

```text
Add example_extension package
```

Example PR checklist:

- package published with `tools/m12labs_extension_tool.py publish`
- `registry.json` updated
- archive committed under `packages/example_extension/...`
- install tested locally
- uninstall tested locally
- frontend page and client route verified

## Quick Checklist

Before opening a PR, confirm all of these are true:

- `extension.json` exists and has the correct id and version
- all package files live under the two allowed install roots
- `meta.json` exists for frontend pages
- `routes/client.php` exists for client API extensions
- `python3 tools/m12labs_extension_tool.py publish extensions/<extension-id>` was run
- `registry.json` contains the package
- `packages/<extension-id>/<version>/<extension-id>.M12LabsExtension` exists
- install works locally
- uninstall works locally

## Real Examples in This Repository

Use these as references while building your own extension:

- `extensions/minecraft_player_manager/extension.json`
- `extensions/discordsrv_helper/extension.json`
- `extensions/minecraft_player_manager/files/app/Extensions/Packages/minecraft_player_manager/routes/client.php`
- `extensions/discordsrv_helper/files/app/Extensions/Packages/discordsrv_helper/routes/client.php`
- `extensions/minecraft_player_manager/files/resources/scripts/extensions/packages/minecraft_player_manager/meta.json`
- `extensions/discordsrv_helper/files/resources/scripts/extensions/packages/discordsrv_helper/index.tsx`

If you want the least friction path, start by copying one of those extension folders and then rename the id, route, metadata, namespaces, and imports.