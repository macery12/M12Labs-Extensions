<?php

namespace Everest\Tests\Extensions\custom_domains;

use Illuminate\Support\Facades\Schema;

/**
 * Build the package's tables from its own migrations.
 *
 * They are not part of the panel's migration chain, so the integration
 * database never has them. Running the migrations the installer runs, rather
 * than a hand-copied schema, keeps the enums, foreign keys and indexes the
 * package really ships under test, and means a migration change cannot
 * silently diverge from what these tests exercise.
 */
trait MigratesCustomDomainsPackage
{
    protected function migrateCustomDomainsPackage(): void
    {
        if (Schema::hasTable('ext_custom_domains_domains')) {
            return;
        }

        $migrations = glob(base_path('app/Extensions/Packages/custom_domains/database/migrations/*.php')) ?: [];
        sort($migrations);

        foreach ($migrations as $file) {
            $migration = require $file;
            $migration->up();
        }
    }
}
