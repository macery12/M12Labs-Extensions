# Creating and Publishing an Extension

This guide targets the current React panel and manifest v2. Read [the review checklist](security-review-checklist.md) and [scanner rules](scanner.md) before writing executable package code. Extensions run inside the panel process and browser origin; they are trusted application code, not sandboxed plugins.

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
  "manifestVersion": 2,
  "package": { "id": "example_extension", "version": "1.0.0" },
  "extension": {
    "id": "example_extension",
    "name": "Example Extension",
    "description": "Shows the current server name.",
    "author": "Your name",
    "icon": "server",
    "route": "example_extension",
    "settingsSchema": [],
    "defaults": { "enabled": false, "allowedNests": [], "allowedEggs": [], "settings": {} }
  },
  "compatiblePanelVersions": [">=Alpha 3.0 <Alpha 4.0"]
}
```

Compatibility entries accept exact labels and normalized semver ranges. For example, `Alpha 3.0` is normalized to `3.0-alpha`, and the example range covers that release up to, but excluding, `Alpha 4.0`. Check the panel's `config('app.version')` and test the bounds you declare. An empty list imposes no compatibility restriction and is rejected by this repository's CI. Historical manifest v1 packages remain supported by the panel; new packages should declare v2. Do not use the proposed v3 schema yet.

## Client routes and permissions

Create `files/app/Extensions/Packages/example_extension/routes/client.php` within your package:

```php
<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\example_extension\Http\Controllers\ExampleController;

Route::prefix('/example_extension')->group(function () {
    Route::get('/', [ExampleController::class, 'index']);
});
```

The panel mounts this beneath `/api/client/servers/{server}/extensions`. The current P0 loader derives `extensions.access:example_extension` from the directory and applies it to every contributed route. Existing package URLs stay unchanged. On older panels without that loader fix, packages must also declare the same middleware themselves; require the fixed panel before relying solely on structural enforcement.

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

Create `files/frontend/src/extensions/packages/example_extension/meta.json`:

```json
{ "id": "example_extension", "route": "example_extension" }
```

Create `files/frontend/src/extensions/packages/example_extension/index.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { useServer } from '@/components/server/ServerContext';
import http from '@/lib/http';

export default function ExampleExtensionPage() {
    const server = useServer();
    const { data, isPending, isError } = useQuery({
        queryKey: ['extension', 'example_extension', server.uuid],
        queryFn: async ({ signal }) => {
            const response = await http.get(
                `/api/client/servers/${server.uuid}/extensions/example_extension`,
                { signal },
            );
            return response.data.attributes as { name: string };
        },
    });
    if (isPending) return <p>Loading…</p>;
    if (isError) return <p>Unable to load the server.</p>;
    return <p>{data.name}</p>;
}
```

Default-export the page. Use the shared HTTP client, theme components/tokens, and package-scoped query keys. Keep credential values out of browser stores, query caches and error metadata. Localize production text through `messages/en.json` and optional locale fragments under the frontend package root, with keys prefixed `ext.example_extension.` and the inlang schema marker. See `node_health_history` for a working localization example; import `td` from `@/i18n/messages` for dynamic extension keys.

For additional v2 features, read [admin pages](admin-pages.md), [database migrations](database-migrations.md), [scheduled tasks](scheduled-tasks.md), and [settings schemas](settings-schema.md). Admin routes inherit a loader-owned `/ext/<id>` prefix and admin gate. Use only `ext_<id>_*` database tables. Disabled packages must not execute routes, commands or schedules. Manifest v3 hooks, secret declarations and other proposed capabilities are not available yet.

## Build and test

```bash
python3 -m unittest discover -s tools/tests -p 'test_*.py' -v
python3 tools/m12labs_extension_tool.py scan extensions/example_extension
python3 tools/m12labs_extension_tool.py build extensions/example_extension
python3 tools/m12labs_extension_tool.py inspect .build/example_extension/1.0.0/example_extension.M12LabsExtension
```

The build rejects scanner block findings and validates v2 metadata and localization. Read warnings and review the source; a clean scan is not a safety guarantee.

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
