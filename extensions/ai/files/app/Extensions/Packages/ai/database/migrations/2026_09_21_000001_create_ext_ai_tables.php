<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

/*
 * The AI package's own tables.
 *
 * Two things about this migration are deliberate.
 *
 * **Each table is created in its final shape.** In the panel these were built
 * by three migrations -- create, then patch, then a second create -- and
 * replaying that sequence here would make a fresh install do archaeology to
 * arrive at a schema this file can simply state.
 *
 * **Every create is guarded.** The module shipped inside the panel for several
 * releases, so an install upgrading into the extension already holds these
 * tables and their rows. The package is opt-in and starts uninstalled; when an
 * operator does install it, the existing transcripts, tool-call audit and usage
 * history are adopted rather than recreated. A guard is what makes "install the
 * AI extension" a different thing from "lose a year of audit rows", and it is
 * also what makes the migration safe to retry after an interrupted run.
 *
 * The consequence worth stating plainly: this migration does not reshape a
 * table it finds. If a future release changes a column, that is a separate
 * migration which alters, because a guarded create cannot see the difference
 * between "already correct" and "correct for an older version".
 */
return new class () extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('ext_ai_conversations')) {
            Schema::create('ext_ai_conversations', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedInteger('user_id');
                // Nullable because an admin-scoped conversation has no server.
                $table->char('server_uuid', 36)->nullable();
                $table->string('scope', 16)->default('server');
                $table->string('title', 255)->default('New conversation');
                $table->json('redactions')->nullable();
                $table->json('assist')->nullable();
                $table->boolean('is_saved')->default(0);
                $table->timestamp('expires_at')->nullable()->index();
                $table->timestamps();

                $table->index(['user_id', 'server_uuid']);
                $table->index(['user_id', 'scope'], 'ext_ai_conversations_user_id_scope_index');
                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('server_uuid')->references('uuid')->on('servers')->cascadeOnDelete();
            });
        }

        if (!Schema::hasTable('ext_ai_messages')) {
            Schema::create('ext_ai_messages', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('conversation_id')->index();
                $table->enum('role', ['user', 'assistant', 'system', 'tool']);
                $table->text('content');
                $table->json('tool_calls')->nullable();
                $table->string('tool_call_id', 128)->nullable();
                $table->string('tool_name', 64)->nullable();
                $table->unsignedSmallInteger('step')->nullable();
                // Millisecond precision: a turn writes several of these inside
                // one second and the transcript has to keep their order.
                $table->timestamp('created_at', 3)->useCurrent();

                $table->foreign('conversation_id')->references('id')->on('ext_ai_conversations')->cascadeOnDelete();
            });
        }

        if (!Schema::hasTable('ext_ai_usage_logs')) {
            Schema::create('ext_ai_usage_logs', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->unsignedInteger('user_id')->nullable()->index();
                $table->char('server_uuid', 36)->nullable()->index();
                $table->unsignedBigInteger('conversation_id')->nullable();
                $table->uuid('turn_id')->nullable();
                $table->unsignedSmallInteger('step')->nullable();
                $table->unsignedSmallInteger('tool_calls_count')->default(0);
                $table->string('model', 100);
                $table->string('source', 20)->default('client');
                $table->unsignedInteger('prompt_tokens')->nullable();
                $table->unsignedInteger('completion_tokens')->nullable();
                $table->unsignedInteger('total_tokens')->nullable();
                $table->unsignedInteger('latency_ms')->nullable();
                $table->enum('status', ['success', 'error', 'suspended', 'running', 'cancelled'])->default('success');
                $table->boolean('cached')->default(0);
                $table->text('error_message')->nullable();
                $table->timestamp('heartbeat_at')->nullable();
                $table->timestamp('deadline_at')->nullable();
                $table->timestamp('cancel_requested_at')->nullable();
                $table->timestamp('created_at')->useCurrent();

                $table->index('created_at');
                $table->unique('turn_id', 'ext_ai_usage_logs_turn_unique');
                $table->index(['user_id', 'created_at'], 'ext_ai_usage_logs_user_created_index');
                $table->index(['user_id', 'status', 'id'], 'ext_ai_usage_logs_user_status_id_index');
                $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
                $table->foreign('server_uuid')->references('uuid')->on('servers')->nullOnDelete();
                $table->foreign('conversation_id')->references('id')->on('ext_ai_conversations')->nullOnDelete();
            });
        }

        if (!Schema::hasTable('ext_ai_tool_calls')) {
            Schema::create('ext_ai_tool_calls', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->uuid('turn_id');
                $table->unsignedBigInteger('conversation_id')->nullable()->index();
                $table->unsignedInteger('user_id')->nullable()->index();
                $table->char('server_uuid', 36)->nullable();
                $table->string('scope', 16)->default('server');
                $table->string('tool_call_id', 128)->nullable();
                $table->string('batch_parent_tool_call_id', 128)->nullable();
                $table->unsignedSmallInteger('batch_index')->nullable();
                $table->string('tool_name', 64);
                $table->string('risk', 16);
                $table->unsignedSmallInteger('step')->default(0);
                $table->json('arguments')->nullable();
                $table->text('result_summary')->nullable();
                $table->string('status', 24)->default('pending_approval');
                $table->unsignedSmallInteger('http_status')->nullable();
                $table->unsignedInteger('duration_ms')->nullable();
                $table->timestamp('created_at', 3)->useCurrent();
                $table->timestamp('resolved_at')->nullable();

                $table->index(['turn_id', 'tool_call_id'], 'ext_ai_tool_calls_turn_call_index');
                $table->index('created_at', 'ext_ai_tool_calls_created_at_index');
                $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
                $table->foreign('conversation_id')->references('id')->on('ext_ai_conversations')->nullOnDelete();
            });
        }

        if (!Schema::hasTable('ext_ai_pending_actions')) {
            Schema::create('ext_ai_pending_actions', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->uuid('turn_id')->unique();
                $table->unsignedBigInteger('conversation_id')->index();
                $table->unsignedInteger('user_id');
                $table->char('server_uuid', 36)->nullable();
                $table->string('scope', 16)->default('server');
                $table->string('tool_name', 64);
                $table->string('tool_call_id', 128)->nullable();
                $table->string('risk', 16);
                $table->json('arguments');
                $table->json('state');
                $table->json('assist_grant')->nullable();
                $table->char('assist_grant_mac', 64)->nullable();
                $table->unsignedSmallInteger('step')->default(0);
                $table->string('status', 16)->default('pending');
                $table->uuid('execution_key')->nullable()->unique();
                $table->timestamp('claimed_at')->nullable();
                $table->timestamp('resolved_at')->nullable();
                $table->string('failure_reason', 255)->nullable();
                $table->timestamp('expires_at');
                $table->timestamps();

                $table->index(['user_id', 'status', 'expires_at'], 'ext_ai_pending_actions_user_status_expires_index');
                $table->index(['user_id', 'server_uuid', 'status'], 'ext_ai_pending_actions_user_server_status_index');
                $table->index(['updated_at', 'status'], 'ext_ai_pending_actions_updated_status_index');
                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('conversation_id')->references('id')->on('ext_ai_conversations')->cascadeOnDelete();
            });
        }

        if (!Schema::hasTable('ext_ai_budget_reservations')) {
            Schema::create('ext_ai_budget_reservations', function (Blueprint $table): void {
                // One live reservation per user, so the user id is the key.
                $table->unsignedInteger('user_id')->primary();
                $table->uuid('token')->unique();
                $table->timestamp('expires_at');
                $table->timestamp('created_at')->useCurrent();

                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            });
        }

        if (!Schema::hasTable('ext_ai_turn_events')) {
            Schema::create('ext_ai_turn_events', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->uuid('turn_id');
                $table->unsignedInteger('seq');
                $table->string('type', 32);
                $table->json('payload')->nullable();
                $table->timestamp('created_at', 3)->useCurrent();

                // The relay resumes from a cursor, so (turn, seq) has to be
                // unique or a reconnecting client can be handed a frame twice.
                $table->unique(['turn_id', 'seq'], 'ext_ai_turn_events_turn_seq_unique');
                $table->index('created_at', 'ext_ai_turn_events_created_at_index');
            });
        }

        if (!Schema::hasTable('ext_ai_settings')) {
            // Configuration the manifest's flat typed schema cannot express --
            // the tool risk overrides, the disabled-tool list, the console
            // allowlist, the privacy categories, the measured tool budgets.
            // Everything an operator edits as a form field is a declared
            // setting instead; see AiConfiguration.
            Schema::create('ext_ai_settings', function (Blueprint $table): void {
                $table->string('key', 191)->primary();
                $table->longText('value')->nullable();
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('ext_ai_settings');
        Schema::dropIfExists('ext_ai_turn_events');
        Schema::dropIfExists('ext_ai_budget_reservations');
        Schema::dropIfExists('ext_ai_pending_actions');
        Schema::dropIfExists('ext_ai_tool_calls');
        Schema::dropIfExists('ext_ai_usage_logs');
        Schema::dropIfExists('ext_ai_messages');
        Schema::dropIfExists('ext_ai_conversations');
    }
};
