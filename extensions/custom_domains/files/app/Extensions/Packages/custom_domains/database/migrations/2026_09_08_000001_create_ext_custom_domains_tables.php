<?php

use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Migrations\Migration;

/*
 * Storage for the Custom Domains package: Cloudflare credentials, the curated
 * parent-domain catalogue, per-server subdomain claims and a DNS audit log.
 *
 * Every table carries the ext_custom_domains_ prefix the manifest declares; the
 * installer cross-checks the two and refuses a migration that creates anything
 * outside it.
 *
 * Two MySQL rules the test suite cannot catch, because it runs on sqlite and
 * sqlite enforces neither:
 *
 *  - Identifiers cap at 64 characters. The unique target key would generate a
 *    66-character name from this table's prefix, so it is named explicitly. Every
 *    other index here generates a name that fits.
 *  - A foreign key column must match the type it references. servers.id and
 *    allocations.id are both int unsigned, so those columns are unsignedInteger;
 *    this package's own ids are bigIncrements, so references to them are
 *    unsignedBigInteger.
 */
return new class () extends Migration {
    public function up(): void
    {
        Schema::create('ext_custom_domains_api_keys', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('name')->unique();
            // Encrypted by the model's cast, and never returned by the API.
            $table->text('token');
            $table->boolean('enabled')->default(1);
            $table->timestamps();
        });

        Schema::create('ext_custom_domains_domains', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('domain')->unique();
            $table->string('cloudflare_zone_id')->nullable();
            $table->unsignedBigInteger('api_key_id')->nullable();
            $table->json('allowed_nest_ids')->nullable();
            $table->json('allowed_egg_ids')->nullable();
            $table->string('service_tag')->nullable();
            $table->json('egg_service_tags')->nullable();
            $table->boolean('wildcard_enabled')->default(0);
            $table->boolean('enabled')->default(1);
            $table->timestamps();

            $table->foreign('api_key_id')->references('id')->on('ext_custom_domains_api_keys')->onDelete('set null');
        });

        Schema::create('ext_custom_domains_server_domains', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('allocation_id')->nullable()->index();
            $table->unsignedBigInteger('custom_domain_id');
            $table->string('subdomain');
            $table->string('full_domain');
            $table->unsignedInteger('port');
            $table->enum('protocol', ['tcp', 'udp', 'both'])->default('both');
            $table->enum('record_type', ['srv', 'cname'])->nullable();
            $table->string('service_tag')->nullable();
            $table->enum('status', ['pending', 'active', 'failed'])->default('pending');
            $table->json('dns_records')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            // Named: the generated name would be 66 characters and MySQL caps
            // identifiers at 64.
            $table->unique(['full_domain', 'port', 'protocol'], 'ext_cd_server_domains_target_unique');
            $table->index(['server_id', 'status']);

            // Cascading from servers is what makes the server.pre_delete hook
            // necessary: these rows are gone the instant the server row is, so
            // there is no "after delete" moment at which they can be read.
            $table->foreign('server_id')->references('id')->on('servers')->onDelete('cascade');
            $table->foreign('allocation_id')->references('id')->on('allocations')->onDelete('set null');
            $table->foreign('custom_domain_id')->references('id')->on('ext_custom_domains_domains')->onDelete('cascade');
        });

        Schema::create('ext_custom_domains_dns_logs', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedInteger('server_id')->nullable();
            $table->unsignedBigInteger('server_custom_domain_id')->nullable();
            $table->enum('action', ['create', 'update', 'delete', 'sync', 'ssl']);
            $table->enum('status', ['success', 'failed']);
            $table->json('payload')->nullable();
            $table->text('message')->nullable();
            $table->timestamps();

            $table->index(['server_id', 'created_at']);
            // set null rather than cascade: the audit line outlives the thing it
            // describes, which is the point of an audit line.
            $table->foreign('server_id')->references('id')->on('servers')->onDelete('set null');
            $table->foreign('server_custom_domain_id')->references('id')->on('ext_custom_domains_server_domains')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ext_custom_domains_dns_logs');
        Schema::dropIfExists('ext_custom_domains_server_domains');
        Schema::dropIfExists('ext_custom_domains_domains');
        Schema::dropIfExists('ext_custom_domains_api_keys');
    }
};
