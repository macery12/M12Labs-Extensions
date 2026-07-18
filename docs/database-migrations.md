# Database Migrations

Extensions can ship their own database tables via migrations. Requires
`manifestVersion: 2` and `backend.migrations: true` (the packaging tool sets
the latter automatically when it detects migration files).

## Location & format

Put migrations in
`files/app/Extensions/Packages/<id>/database/migrations/`. Use **anonymous-class
migrations** (no autoloading needed):

```php
<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('ext_my_ext_things', function (Blueprint $table) {
            $table->id();
            $table->timestamp('created_at')->nullable();
        });
    }
    public function down(): void {
        Schema::dropIfExists('ext_my_ext_things');
    }
};
```

## Table-name prefix (required)

Every table you create **must** be prefixed `ext_<id>_`. The installer rejects
`Schema::create` outside that namespace, and the scanner flags it as a
block-severity finding. This keeps extension tables from colliding with core
tables or each other.

Prefer **not** using foreign keys to core tables (nodes, servers, users): a
hard FK can block core deletes or cascade away data. Index the id column and
prune orphans instead (the `node_health_history` example does this).

## When migrations run

- **Install**: after files are copied, before the panel rebuild (the
  `migrating` progress stage). A failing migration rolls its partial batch back,
  writes a log, and aborts the install.
- **Update**: only newly-added migration files run (Laravel skips already-ran
  filenames). A failed update rolls back just that batch.
- Your `down()` **must** fully drop the tables `up()` created — uninstall data
  drop and rollback both rely on it.

## Uninstall data handling

**Data is preserved by default.** A normal uninstall removes your files and the
panel's records but leaves your `ext_<id>_*` tables (and their `migrations`
rows) in place. Reinstalling the same version reattaches to the existing data.
The uninstall output lists the preserved tables and prints manual cleanup SQL.

**Dropping data is opt-in and audited.** Operators can pass `--drop-data`:

```bash
php artisan p:extensions:uninstall my_ext --drop-data
# prompts for a typed confirmation of the extension id unless --force
```

or use the checkbox + type-to-confirm in the admin uninstall drawer, or the API
(`{ "drop_data": true, "confirm": "my_ext" }`). This rolls your migrations back
(dropping the tables) before removing files. **Dropped data is unrecoverable.**

Every drop writes an audit log to
`storage/logs/extension-migrations-<id>-<timestamp>.log` (initiator, tables,
migrations, migrator output, and any error). If the automated drop fails, the
uninstall aborts and the error includes the log path plus manual fallback SQL:

```sql
DROP TABLE IF EXISTS `ext_my_ext_things`;
DELETE FROM `migrations` WHERE `migration` IN ('2026_..._create_ext_my_ext_things_table');
```

Operators can run that by hand against the panel database to finish cleanup.
