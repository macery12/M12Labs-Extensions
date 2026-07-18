# Settings Schema

An extension declares configurable settings via `extension.settingsSchema` in
`extension.json`. The panel renders these as a form in the admin manage drawer
and stores the values in `extension_configs.settings` (a JSON column, global —
not per-server).

## Field shape

```jsonc
"settingsSchema": [
  {
    "key": "poll_interval_minutes",   // storage key (also the settings[] key)
    "label": "Poll interval (minutes)",
    "type": "number",
    "help": "How often to poll.",     // optional helper text
    "placeholder": "5",               // optional (text/number/textarea)
    "options": [                       // required for type: select
      { "value": "a", "label": "Option A" }
    ]
  }
]
```

## Field types

| `type` | Renders as |
|---|---|
| `text` | single-line text input |
| `password` | masked text input |
| `number` | numeric input (stored as a number) |
| `textarea` | multi-line text |
| `boolean` | toggle switch |
| `select` | dropdown (requires `options`) |

Labels, help text, placeholders, and option labels are shown **verbatim** —
they are manifest strings, not run through the panel i18n catalog.

## Defaults

Seed initial values in `extension.defaults.settings`. They populate
`extension_configs.settings` when the extension is installed:

```jsonc
"defaults": {
  "enabled": false,
  "allowedNests": [],
  "allowedEggs": [],
  "settings": { "poll_interval_minutes": 5, "retention_days": 30 }
}
```

## Reading settings in backend code

```php
use Everest\Models\ExtensionConfig;

$config = ExtensionConfig::getByExtensionId('my_ext');
$interval = (int) ($config?->settings['poll_interval_minutes'] ?? 5);
```

Settings are global to the extension. Per-server access is controlled
separately by `allowed_nests` / `allowed_eggs` and the server-eligibility
middleware, not by settings.
