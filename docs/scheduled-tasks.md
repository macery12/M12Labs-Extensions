# Scheduled Tasks

Extensions can register recurring jobs on the panel scheduler. Requires
`manifestVersion: 2` and `backend.schedule: true` (set automatically when a
`schedule.php` is present).

The pattern is two parts: an **artisan command** (the actual work, reviewable
and runnable by hand) and a small **`schedule.php`** that maps the command onto
the scheduler.

## The command

Under `files/app/Extensions/Packages/<id>/Console/Commands/`:

```php
<?php
namespace Everest\Extensions\Packages\my_ext\Console\Commands;

use Everest\Models\ExtensionConfig;
use Illuminate\Console\Command;

class DoThingCommand extends Command
{
    protected $signature = 'p:ext:my-ext:do-thing';   // p:ext:<id>:<verb>
    protected $description = 'Does the thing (My Extension).';

    public function handle(): int
    {
        // Second enable-gate: the scheduler only loads schedule.php for enabled
        // extensions, but the command can also be run manually, so guard here.
        $config = ExtensionConfig::getByExtensionId('my_ext');
        if (!$config || !$config->enabled) {
            return self::SUCCESS;
        }
        // ... work ...
        return self::SUCCESS;
    }
}
```

Conventions (enforced by review + scanner):
- Namespace `Everest\Extensions\Packages\<id>\Console\Commands`.
- Signature prefixed `p:ext:<id>:` (dashes, not underscores, read best).
- The command must early-exit when the extension is disabled.

The panel auto-loads commands from every
`app/Extensions/Packages/*/Console/Commands` directory.

## schedule.php

At `files/app/Extensions/Packages/<id>/schedule.php`, return a closure:

```php
<?php
use Illuminate\Console\Scheduling\Schedule;

return function (Schedule $schedule): void {
    $schedule->command('p:ext:my-ext:do-thing')
        ->everyFiveMinutes()
        ->withoutOverlapping();
};
```

The panel loads this file **only for enabled extensions**, so a disabled
extension registers no schedule entries at all — that's the first enable-gate.
You can read the extension's settings here to make the cadence configurable
(see `node_health_history/schedule.php`, which derives its interval from the
`poll_interval_minutes` setting).

Keep `schedule.php` to scheduler wiring only — no side effects, no `Route::`
calls. A parse error or exception in one extension's file is isolated and won't
break the rest of the schedule, but it means your job silently won't run.

## Verifying

```bash
php artisan schedule:list          # your command appears only when enabled
php artisan p:ext:my-ext:do-thing  # run it by hand
```
