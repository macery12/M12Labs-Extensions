# Admin Pages

An extension can contribute a page to the panel admin area (a sidebar entry
under an "Extensions" group at `/admin/extensions/<route>`), with or without a
server-facing page.

## Manifest

Add an `admin` block to `extension.json` under `extension`, and set
`manifestVersion: 2`. For an **admin-only** extension (no server page), set
`route: null`.

```jsonc
{
  "manifestVersion": 2,
  "package": { "id": "my_ext", "version": "1.0.0" },
  "extension": {
    "id": "my_ext",
    "name": "My Extension",
    "route": null,                       // no server page
    "admin": { "route": "my_ext", "label": "My Extension", "icon": "server" },
    "settingsSchema": [],
    "defaults": { "enabled": false, "allowedNests": [], "allowedEggs": [], "settings": {} }
  },
  "compatiblePanelVersions": ["Alpha 3.0"]
}
```

- `admin.route` — URL slug (`^[a-z0-9_-]+$`), mounts at `/admin/extensions/<route>`.
- `admin.label` — sidebar label (1–60 chars). Shown verbatim.
- `admin.icon` — optional; resolved against the panel's icon map (falls back to a generic icon).

## Files

Two files, both under `frontend/src/extensions/packages/<id>/`:

`meta.json` — must mirror the manifest `admin` block (the panel frontend loader
discovers admin pages through it):

```json
{ "id": "my_ext", "admin": { "route": "my_ext", "label": "My Extension", "icon": "server" } }
```

`admin.tsx` — default-exports the page component. Keep it separate from a
server `index.tsx`: the panel loads admin and server entries independently, so
a server-only extension never ships `admin.tsx` and an admin-only extension
never ships `index.tsx`.

The packaging tool errors if the `admin` block and `admin.tsx`/`meta.json`
disagree.

## Talking to the backend

Admin pages call the extension's own admin API (see the admin routes section of
[database-migrations](database-migrations.md) and the example). Endpoints mount
under `/api/application/extensions/ext/<id>/…` and are admin-authed. Use the
panel's shared HTTP client:

```ts
import http from '@/lib/http';
const BASE = '/api/application/extensions/ext/my_ext';
export const getThing = async () => (await http.get(BASE)).data;
```

## UI conventions (required)

- **Every colour is a theme CSS variable** (`var(--color-ink)`, `var(--brand)`,
  `var(--color-surface)`, `var(--color-border)`, `var(--color-accent)`,
  `var(--color-danger)`, …). Never hardcode a hex/named colour — pages must work
  in both light and dark themes.
- **Strings are literal English.** Extensions cannot contribute Paraglide
  message keys (the compile source is outside the install allowlist). This is a
  known limitation; see the panel ROADMAP.
- No chart library is bundled — draw simple visualizations as inline SVG using
  theme variables (see `node_health_history/admin.tsx`).

## Gating

The page is hidden unless the extensions module is enabled **and** the
extension itself is enabled (`ExtensionConfig.enabled`). The panel enforces the
same state server-side via the `extensions.admin` middleware on the API, so a
disabled extension's endpoints return 404 even if a stale SPA renders the shell.
