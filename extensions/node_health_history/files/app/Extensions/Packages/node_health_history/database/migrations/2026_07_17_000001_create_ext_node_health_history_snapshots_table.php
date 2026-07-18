<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Snapshots table for the Node Health History extension.
 *
 * node_id is indexed but deliberately NOT a foreign key: the extension only
 * reads nodes, and a hard FK would block core node deletion (or cascade-delete
 * history the operator may still want). Orphan rows are pruned by retention.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ext_node_health_history_snapshots', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('node_id')->index();
            $table->boolean('healthy')->default(false);
            $table->unsignedInteger('latency_ms')->nullable();
            $table->string('wings_version')->nullable();
            $table->unsignedBigInteger('memory_bytes')->nullable();
            $table->unsignedBigInteger('memory_total_bytes')->nullable();
            $table->string('error')->nullable();
            $table->timestamp('captured_at')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ext_node_health_history_snapshots');
    }
};
