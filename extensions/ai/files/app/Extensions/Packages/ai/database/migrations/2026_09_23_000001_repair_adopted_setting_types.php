<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Everest\Extensions\Packages\ai\AiConfiguration;
use Illuminate\Database\Migrations\Migration;

/*
 * Put back the types 1.0.2's settings adoption guessed wrong.
 *
 * It read the panel's old settings rows, which are all strings, and decided
 * each one's type from the string alone -- so a per-user limit of "1" became
 * `true` and a queue depth of "0" became `false`. The settings validator then
 * refused every save of every field, from the AI Settings page and the
 * extension drawer alike, because a save validates the whole stored set:
 * "The concurrency per user must be a number", on a page that has no such
 * field.
 *
 * Every declared value is re-typed against its declared field. A value that
 * is already the right type is left exactly as it is, so this is a no-op on
 * an install that never adopted anything. Irreversible, because the wrong
 * type is not worth restoring.
 */
return new class () extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('extension_configs')) {
            return;
        }

        $row = DB::table('extension_configs')
            ->where('extension_id', AiConfiguration::EXTENSION_ID)
            ->first(['settings']);

        $settings = $row === null ? null : json_decode((string) $row->settings, true);

        if (!is_array($settings)) {
            return;
        }

        $repaired = $settings;

        foreach ($settings as $key => $value) {
            if (AiConfiguration::declares((string) $key)) {
                $repaired[$key] = AiConfiguration::coerceDeclared((string) $key, $value);
            }
        }

        if ($repaired === $settings) {
            return;
        }

        DB::table('extension_configs')
            ->where('extension_id', AiConfiguration::EXTENSION_ID)
            ->update(['settings' => json_encode($repaired), 'updated_at' => now()]);
    }

    public function down(): void
    {
    }
};
