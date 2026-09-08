# Creating and Publishing an Extension

This guide targets panel Alpha 4.0 and **manifest v3**. Read [the review checklist](security-review-checklist.md) and [scanner rules](scanner.md) before writing executable package code. Extensions run inside the panel process and browser origin; they are trusted application code, not sandboxed plugins.

Two rules shape the whole v3 contract, and most of the differences from v2 follow from them:

- **Missing means denied.** A capability the manifest does not declare is never inferred from files on disk. Shipping a `schedule.php` does not give you a schedule; declaring `capabilities.schedule` does, and then the file must exist.
- **Unknown means rejected.** An unrecognised key is an error, not something to ignore, so a manifest written against a newer panel fails loudly instead of installing with a gate silently missing.

Manifest v1 and v2 are no longer accepted. There is no upgrade path: those manifests have no capability block, so every surface would have to be inferred — exactly what v3 removes.

## Start a package

Fork and clone this repository, create a branch, and work under `extensions/<id>/`. Use one stable lowercase package ID in the descriptor, directory, PHP namespace, frontend metadata and permissions.

```bash
git checkout -b add-example-extension
mkdir -p extensions/example_extension/files/app/Extensions/Packages/example_extension/Http/Controllers
mkdir -p extensions/example_extension/files/app/Extensions/Packages/example_extension/Http/Requests
mkdir -p extensions/example_extension/files/app/Extensions/Packages/example_extension/routes
mkdir -p extensions/example_extension/files/frontend/src/extensions/packages/example_extension
```

Only two install roots are allowed:

- `app/Extensions/Packages/<id>/`
- `frontend/src/extensions/packages/<id>/`

The `files/` prefix belongs to the repository source tree and is removed when packaging. Do not install into core routes, controllers, public files, dependency manifests or deployment configuration.

Create `extensions/example_extension/extension.json`:

```json
{
  "manifestVersion": 3,
  "package": { "id": "example_extension", "version": "1.0.0", "publisher": "Your name" },
  "extension": {
    "id": "example_extension",
    "name": "Example Extension",
    "description": "Shows the current server name.",
    "icon": "server",
    "defaults": { "enabled": false, "allowedNests": [], "allowedEggs": [], "settings": {} }
  },
  "compatiblePanelVersions": [">=Alpha 4.0 <Alpha 5.0"],
  "capabilities": {
    "routes": { "client": true },
    "pages": {
      "server": [{
        "slug": "overview",
        "labelKey": "ext.example_extension.nav.overview",
        "icon": "server",
        "category": "general",
        "order": 10
      }]
    }
  },
  "requirements": { "extensions": [] }
}
```

Note what is **not** there. `extension.route`, `extension.admin` and top-level `backend` were removed, and `extension.settingsSchema` moved to `capabilities.settings.fields`. A package never names a path or a prefix: routes are loaded from `routes/{client,admin}.php`, pages from `pages/<surface>/<slug>.tsx`, and the URL, table prefix, translation prefix and permission prefix are all derived from the extension id. That is what stops a package shadowing a core route or reading another extension's data.

Compatibility entries accept exact labels and normalized semver ranges. For example, `Alpha 4.0` is normalized to `4.0-alpha`, and the example range covers that release up to, but excluding, `Alpha 5.0`. Check the panel's `config('app.version')` and test the bounds you declare. An empty list imposes no compatibility restriction and is rejected by this repository's CI.

The full capability vocabulary is a closed allowlist — `routes`, `pages`, `permissions`, `database`, `hooks`, `queues`, `schedule`, `commands`, `secrets`, `settings`. Declare only what you ship: the packaging tool and the panel both check the pairing in **both** directions, so a declaration without its file and a file without its declaration are equally rejected.

## Client routes and permissions

Create `files/app/Extensions/Packages/example_extension/routes/client.php` within your package:

```php
<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\example_extension\Http\Controllers\ExampleController;

// No prefix and no middleware. The loader wraps this file in
// /ext/example_extension with the access gate and throttle already applied;
// declaring your own would either duplicate the gate or escape it.
Route::get('/', [ExampleController::class, 'index']);
```

The panel mounts this at `/api/client/servers/{server}/extensions/ext/example_extension/`. The loader derives `extensions.access:example_extension` and `throttle:api.ext-client` from the directory name and applies both to every contributed route, so the gate cannot be forgotten or removed. Routes whose URI escapes that prefix are rejected by the route audit, in the cached route table as well as the live one.

Never use `withoutMiddleware()`, substitute middleware definitions, or name another extension in an access gate. Violations block the route, including in the cached route table. Server authentication and ownership/subuser access, extension enabled/eligibility checks, throttling and action permissions remain separate requirements. The extension gate does not grant server permissions.

Create `files/app/Extensions/Packages/example_extension/Http/Requests/ExampleRequest.php`:

```php
<?php

namespace Everest\Extensions\Packages\example_extension\Http\Requests;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

class ExampleRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_ALLOCATION_READ;
    }
}
```

Create `files/app/Extensions/Packages/example_extension/Http/Controllers/ExampleController.php`:

```php
<?php

namespace Everest\Extensions\Packages\example_extension\Http\Controllers;

use Everest\Models\Server;
use Illuminate\Http\JsonResponse;
use Everest\Extensions\Packages\example_extension\Http\Requests\ExampleRequest;

class ExampleController
{
    public function index(ExampleRequest $request, Server $server): JsonResponse
    {
        return new JsonResponse([
            'object' => 'extension_example_extension',
            'attributes' => ['name' => $server->name],
        ]);
    }
}
```

Use typed FormRequests for every action and choose permissions appropriate to the operation. Resolve resources from the authenticated server route; do not trust request-supplied server/user IDs. Route handler closures are prohibited; closures that group controller routes are allowed.

## Frontend entry

`meta.json` is gone. Pages are declared in the manifest and shipped at a path derived from the declared slug, so create
`files/frontend/src/extensions/packages/example_extension/pages/server/overview.tsx` — matching the `slug: "overview"` above:

```tsx
import { useQuery } from '@tanstack/react-query';
import {
    createExtensionClient,
    useExtensionServerContext,
    extensionQueryKey,
} from '@/extensions-sdk';

export default function ExampleExtensionPage() {
    const { server } = useExtensionServerContext();
    const client = createExtensionClient('example_extension', server.uuid);

    const { data, isPending, isError } = useQuery({
        queryKey: extensionQueryKey('example_extension', '1.0.0', server.uuid),
        // The client is bound to this extension's own namespace, so '/' is
        // /api/client/servers/<uuid>/extensions/ext/example_extension/.
        queryFn: ({ signal }) => client.get<{ name: string }>('/', { signal }),
    });

    if (isPending) return <p>Loading…</p>;
    if (isError) return <p>Unable to load the server.</p>;
    return <p>{data.name}</p>;
}
```

Default-export the page. **Every `@/` import must come from `@/extensions-sdk`** — the installer scans shipped `.ts`/`.tsx` and rejects a package that reaches into panel internals, which are unsupported and change without notice. The SDK provides the namespaced HTTP client, server and admin context, query keys, a bound translator, approved UI primitives, and the error boundary each page is wrapped in.

Keep credential values out of browser stores, query caches and error metadata. Localize production text through `messages/en.json` and optional locale fragments under the frontend package root, with keys prefixed `ext.example_extension.` and the inlang schema marker; every `labelKey` in the manifest must resolve there. Use `createTranslator('example_extension')` from the SDK. See `node_health_history` for a working example.

A package may now ship **several pages per surface** rather than the single `index.tsx`/`admin.tsx` v2 allowed. Each declares its own sidebar category, order and permission, and appears in that category rather than behind a generic "Extensions" tab. Supporting components may live in a subdirectory beside a page without being declared.

For the remaining capabilities read [admin pages](admin-pages.md), [database migrations](database-migrations.md), [scheduled tasks](scheduled-tasks.md), and [settings schemas](settings-schema.md). Use only `ext_<id>_*` database tables, declared under `capabilities.database.tables`. Disabled packages execute no routes, commands, schedules, hooks or queued jobs.

## Build and test

```bash
python3 -m unittest discover -s tools/tests -p 'test_*.py' -v
python3 tools/m12labs_extension_tool.py scan extensions/example_extension
python3 tools/m12labs_extension_tool.py build extensions/example_extension
python3 tools/m12labs_extension_tool.py inspect .build/example_extension/1.0.0/example_extension.M12LabsExtension
```

The build rejects scanner block findings and validates the v3 capability/file pairing and localization. Read warnings and review the source; a clean scan is not a safety guarantee.

### Signing

Set a release key in the environment and the build signs the manifest as it ships:

```bash
export M12LABS_RELEASE_KEY_ID=m12labs-release-2026a
export M12LABS_RELEASE_KEY=/path/to/release.private.b64
```

Without one the archive is unsigned, which is fine for local testing: a panel with a pinned signing root installs it only with an explicit typed acknowledgement, and such a package may declare neither hooks, nor queues, nor a permission marked dangerous.

The signature covers the **canonical manifest**, not the archive's bytes — it ships inside the archive, so covering the archive hash would change the hash it just committed to. Nothing is lost: the manifest carries a sha256 for every file, and the panel installs only files the manifest lists, verifying each one. See `tools/signing.py`.

Install the built archive in a development panel (example panel path `/var/www/m12labs`):

```bash
cd /var/www/m12labs
php artisan p:extensions:install /var/www/M12Labs-Extensions/.build/example_extension/1.0.0/example_extension.M12LabsExtension --file
```

Enable the extension explicitly. Test eligible/ineligible servers, owners and subusers, denied permissions, disabled state, registered and cached routes, frontend build/loading, update and uninstall. Run build commands as the deployment user so generated files retain the correct ownership. Uninstall with `php artisan p:extensions:uninstall example_extension --force`; data is preserved by default.

## Publish and open a pull request

For every changed release, bump `package.version`, then run from this repository:

```bash
python3 tools/m12labs_extension_tool.py publish extensions/example_extension
python3 tools/check_extensions.py
git add extensions/example_extension packages/example_extension registry.json
git commit -m "Add example_extension package"
```

The publisher scans before writing the archive or registry. Commit the source, generated archive and registry together. Never overwrite an already distributed version. Open a pull request with behavior, tested panel versions, permission/data changes and validation results. The **Extension security gate** CI job must pass before merge or distribution. Maintainers must configure that status check as required in GitHub branch protection; see the [README](../README.md#required-ci).

CI validates all current source/build/release pairs and every registry checksum. With a Git base commit, it also scans all new or modified archives and registry releases, including historical versions. Unmodified historical archives are retained without applying current path rules retroactively. Scanner warnings need review; block findings must be fixed.
