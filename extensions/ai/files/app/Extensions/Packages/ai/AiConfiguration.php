<?php

namespace Everest\Extensions\Packages\ai;

use Illuminate\Support\Facades\DB;
use Everest\Extensions\Sdk\DisplayException;
use Everest\Extensions\Sdk\Services\PackageSecrets;
use Everest\Extensions\Sdk\Services\PackageSettings;

/**
 * Every AI configuration read, in one place.
 *
 * In the panel this read two stores: `config('modules.ai.*')` and
 * `Setting::get('settings::modules:ai:*')`. A package has neither —
 * `config/modules/ai.php` went with the module, and core's settings table is
 * not a package's to write. So the same dotted keys now resolve across three
 * stores that are, and callers did not change.
 *
 * The lookup order, first hit wins:
 *
 * 1. **`enabled`** is the package's own enable state, not a setting. An
 *    administrator switching the extension off in the panel is what turns the
 *    module off; a second switch that could disagree with it would be a way to
 *    have AI enabled and disabled at the same time.
 * 2. **Credentials** come from the encrypted secret store. Never from
 *    settings: `extension_configs.settings` is a plain JSON column the catalog
 *    API returns, which is why the manifest has no `password` field type.
 * 3. **Declared flat settings** — the 29 fields in the manifest. The key is
 *    the dotted one with dots as underscores, because a manifest setting key
 *    is flat: `agent.max_steps` is stored as `agent_max_steps`.
 * 4. **`ext_ai_settings`**, this package's own table, for the structured
 *    values a flat typed schema cannot express — the tool risk overrides, the
 *    disabled-tool list, the console allowlist, the privacy categories, the
 *    measured tool budgets — and for the retention and timeout values that
 *    were environment-only in the panel.
 * 5. **{@see DEFAULTS}**, the packaged fallback.
 *
 * ## Why the split is where it is
 *
 * Anything the panel's generated settings form can render and validate belongs
 * in the manifest, because that gets an operator a typed field, a range check
 * and an approval diff for free — and because a declared setting is the only
 * thing `capabilities.flags` can read, which is what keeps the sidebar entry
 * hidden until a provider is actually configured.
 *
 * Everything else is a JSON document that a `text`/`number`/`boolean` schema
 * would have to lie about. Those live in a package-owned table rather than
 * being squeezed into the flat one.
 */
final class AiConfiguration
{
    public const EXTENSION_ID = 'ai';

    /** This package's own settings table, for what the flat schema cannot hold. */
    public const TABLE = 'ext_ai_settings';

    /**
     * Credentials, by the dotted key the module has always used.
     *
     * Three rather than one because the provider slot is shared: an operator
     * who configures Anthropic, switches to OpenAI and switches back should
     * not have to paste the first key again.
     */
    private const SECRETS = [
        'key' => 'api_key',
        'anthropic.key' => 'anthropic_key',
        'openai.key' => 'openai_key',
    ];

    /**
     * Packaged defaults for values with no declared setting.
     *
     * The retention and timeout values were environment variables in the
     * panel (`AI_RETENTION_*`, `AI_TIMEOUT`). A package cannot read the
     * operator's `.env`, so they become defaults that {@see TABLE} can
     * override — which is a small improvement on being env-only, since an
     * operator can now change them without a deploy.
     */
    private const DEFAULTS = [
        'timeout' => 300,
        'connect_timeout' => 10,
        'agent.tool_rate_limit' => 240,

        'retention.turn_events_days' => 2,
        'retention.tool_calls_days' => 90,
        'retention.usage_logs_days' => 180,
        'retention.pending_actions_days' => 30,
        'retention.turn_events_limit' => 50000,
        'retention.tool_calls_limit' => 20000,
        'retention.usage_logs_limit' => 20000,
        'retention.pending_actions_limit' => 20000,
    ];

    /**
     * The house system prompt, when an operator has not written one.
     *
     * A blank stored value falls back here rather than to no prompt at all: an
     * admin who clears the field is asking for the default back, and a model
     * given no framing answers as a generic chatbot with no idea it is inside
     * a game server panel.
     */
    public const DEFAULT_SYSTEM_PROMPT =
        'You are the assistant in a game-server hosting control panel. Be direct and concrete. '
        . 'Lead with the outcome and match the level of detail to the request. '
        . 'Prefer exact, verified paths, setting names and values over general advice. If a fact is not '
        . 'verified, say what is unknown and how to check it. Explain user impact before suggesting work '
        . 'that deletes data or interrupts players.';

    /**
     * The flat fields the manifest declares, which is what decides where a
     * write goes.
     *
     * Spelled out rather than derived, because the only way to ask the panel
     * would be to read the verified runtime plan -- core internals a package
     * has no supported access to, and should not, since that projection is
     * what gates the package itself. The manifest and this list live in the
     * same repository and change in the same commit; a key in one and not the
     * other means a write lands in the package's own table instead of the
     * settings column, which is wrong but not dangerous.
     */
    private const DECLARED = [
        'provider', 'mode', 'endpoint',
        'model', 'max_tokens', 'temperature',
        'context_tokens', 'keep_alive', 'warm',
        'system_prompt', 'agent_enabled', 'agent_admin_enabled',
        'agent_reasoning', 'agent_durable', 'agent_max_steps',
        'agent_max_wall_seconds', 'agent_max_tool_seconds', 'agent_tool_result_bytes',
        'agent_max_repairs', 'agent_max_tools', 'agent_max_batch_calls',
        'agent_allow_destructive_batches', 'concurrency_slots', 'concurrency_queue_depth',
        'concurrency_max_wait_seconds', 'concurrency_per_user', 'budget_enforce',
        'budget_monthly_tokens', 'privacy_enabled',
    ];

    /** @var array<string, mixed>|null */
    private static ?array $tableCache = null;

    public static function get(string $key, mixed $default = null): mixed
    {
        if ($key === 'enabled') {
            return PackageSettings::for(self::EXTENSION_ID)->enabled();
        }

        if ($key === 'default_system_prompt') {
            return self::DEFAULT_SYSTEM_PROMPT;
        }

        if (isset(self::SECRETS[$key])) {
            return PackageSecrets::for(self::EXTENSION_ID)->get(self::SECRETS[$key]);
        }

        $flat = self::settingKey($key);

        if (self::declares($flat)) {
            $settings = PackageSettings::for(self::EXTENSION_ID);

            // A declared key that has never been written reads as absent, not
            // as its declared default: the installer seeds the manifest's
            // defaults into the column, so the only way to be here is an
            // upgrade that added a field before anybody saved the page. Fall
            // through to the packaged default rather than inventing one.
            if ($settings->has($flat)) {
                return $settings->all()[$flat];
            }
        }

        $stored = self::table();

        if (array_key_exists($key, $stored)) {
            return $stored[$key];
        }

        return self::DEFAULTS[$key] ?? $default;
    }

    public static function string(string $key, string $default = ''): string
    {
        $value = self::get($key);

        return is_string($value) || is_numeric($value) ? (string) $value : $default;
    }

    public static function integer(string $key, int $default = 0): int
    {
        $value = self::get($key);

        return is_numeric($value) ? (int) $value : $default;
    }

    public static function number(string $key, float $default = 0.0): float
    {
        $value = self::get($key);

        return is_numeric($value) ? (float) $value : $default;
    }

    /**
     * Anything the operator could have meant as true.
     *
     * Only null means absent. An empty string is a *stored* false, which is
     * what a settings form writes for a switch turned off, so treating it as
     * "never set, use the default" would turn every disabled toggle whose
     * default is true back on.
     */
    public static function boolean(string $key, bool $default = false): bool
    {
        $value = self::get($key);

        if ($value === null) {
            return $default;
        }

        return filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
    }

    /**
     * A structured value -- a list or a map.
     *
     * Malformed JSON returns the default rather than throwing. A parse error
     * here would take down whichever surface read it first, and one
     * unparseable row is not a reason to refuse to answer a question about
     * something else.
     *
     * @param array<array-key, mixed> $default
     *
     * @return array<array-key, mixed>
     */
    public static function list(string $key, array $default = []): array
    {
        $value = self::get($key);

        if (is_array($value)) {
            return $value;
        }

        if (is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);

            return is_array($decoded) ? $decoded : $default;
        }

        return $default;
    }

    /** A credential, or the empty string when none is configured. */
    public static function secret(string $key, string $default = ''): string
    {
        $value = self::get($key);

        return is_string($value) && $value !== '' ? $value : $default;
    }

    /**
     * Save an administrator's value.
     *
     * A declared field goes to the package's settings, through the validator
     * that enforces its declared type and range. Everything else goes to this
     * package's own table. A credential is refused outright: secrets are
     * entered and rotated by an administrator through the panel's own secret
     * UI, and a package writing its own credentials would mean a value in the
     * store that no operator put there.
     *
     * @throws DisplayException on an attempt to write a credential
     */
    public static function set(string $key, mixed $value): void
    {
        if (isset(self::SECRETS[$key])) {
            throw new DisplayException(sprintf(
                'The credential [%s] is entered through the panel\'s encrypted secret store, not through settings.',
                $key
            ));
        }

        $flat = self::settingKey($key);

        if (self::declares($flat)) {
            PackageSettings::for(self::EXTENSION_ID)->save([$flat => $value]);

            return;
        }

        DB::table(self::TABLE)->updateOrInsert(
            ['key' => $key],
            ['value' => is_string($value) ? $value : json_encode($value), 'updated_at' => now()],
        );

        self::$tableCache = null;
    }

    /** The flat settings key for a dotted key: `agent.max_steps` -> `agent_max_steps`. */
    public static function settingKey(string $key): string
    {
        return str_replace('.', '_', $key);
    }

    /**
     * Forget the table cache.
     *
     * The cache is per-request and exists because a turn reads a dozen of
     * these between steps. A queued turn outlives a request, which is the one
     * place that has to say so.
     */
    public static function flush(): void
    {
        self::$tableCache = null;
    }

    /**
     * Whether a flat key is one of the manifest's declared fields.
     *
     * Public because "where would a write to this key go" is a question with
     * two different answers and no way to tell them apart from outside -- the
     * settings column for a declared field, this package's own table for
     * everything else. A caller that has to put a value somewhere itself,
     * rather than through {@see set()}, needs to be able to ask.
     */
    public static function declares(string $flatKey): bool
    {
        return in_array($flatKey, self::DECLARED, true);
    }

    /** @return array<string, mixed> */
    private static function table(): array
    {
        if (self::$tableCache !== null) {
            return self::$tableCache;
        }

        $rows = [];

        foreach (DB::table(self::TABLE)->get(['key', 'value']) as $row) {
            $decoded = json_decode((string) $row->value, true);
            $rows[(string) $row->key] = $decoded === null && $row->value !== 'null' ? $row->value : $decoded;
        }

        return self::$tableCache = $rows;
    }
}
