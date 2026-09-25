<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

/*
 * When something actually started executing a turn.
 *
 * A durable turn is `running` from the moment the request accepts it, which is
 * before any worker has it. Without a separate mark there was no telling a turn
 * that is executing from one still sitting in the queue -- so Stop could only
 * leave a note for a worker that might never come, and a worker that finally
 * arrived ran a turn the user had already stopped, or one the deadline sweep
 * had already failed.
 */
return new class () extends Migration {
    public function up(): void
    {
        if (!Schema::hasColumn('ext_ai_usage_logs', 'claimed_at')) {
            Schema::table('ext_ai_usage_logs', function (Blueprint $table): void {
                $table->timestamp('claimed_at')->nullable()->after('deadline_at');
            });
        }

        // A turn in flight across the upgrade that has visibly made progress
        // was claimed by whatever is running it; leaving it unclaimed would let
        // a Stop finalize work that is still executing.
        DB::table('ext_ai_usage_logs')
            ->whereIn('status', ['running', 'suspended'])
            ->whereNull('claimed_at')
            ->where(fn ($query) => $query->where('step', '>', 0)->orWhereColumn('heartbeat_at', '>', 'created_at'))
            ->update(['claimed_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('ext_ai_usage_logs', 'claimed_at')) {
            Schema::table('ext_ai_usage_logs', function (Blueprint $table): void {
                $table->dropColumn('claimed_at');
            });
        }
    }
};
