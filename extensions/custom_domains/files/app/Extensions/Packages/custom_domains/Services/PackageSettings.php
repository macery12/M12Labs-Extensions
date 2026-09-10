<?php

namespace Everest\Extensions\Packages\custom_domains\Services;

use Everest\Models\ExtensionConfig;
use Everest\Services\Extensions\ExtensionSecretStore;

/**
 * Typed access to this package's own settings and secret.
 *
 * In core this feature read config('modules.custom_domains.*'), which an
 * extension has no equivalent of — a package cannot ship a config file, because
 * a config file is loaded on every request whether the extension is enabled or
 * not. Settings live in extension_configs.settings, validated against the
 * manifest's declared fields on every write, and the Cloudflare token lives in
 * the encrypted secret store.
 *
 * The defaults here repeat the manifest's, deliberately: a settings row can be
 * absent (a fresh install before the drawer is opened) or missing a key (a
 * setting added by a later release), and neither should read as zero.
 */
final class PackageSettings
{
    public const EXTENSION_ID = 'custom_domains';

    public const SECRET_CLOUDFLARE_TOKEN = 'cloudflare_token';

    private const DEFAULTS = [
        'cloudflare_proxied' => false,
        'cloudflare_retries' => 3,
        'cloudflare_retry_sleep_ms' => 250,
        'allow_wildcard' => false,
        'max_wildcards_per_user' => 1,
    ];

    /** @var array<string, mixed>|null */
    private static ?array $cache = null;

    /**
     * Settings are read once per request. The row cannot change mid-request —
     * a settings write goes through the panel's own controller, which is a
     * different request — and provisioning one server can otherwise re-read it
     * per mapping.
     *
     * @return array<string, mixed>
     */
    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $stored = ExtensionConfig::getByExtensionId(self::EXTENSION_ID)?->settings;

        return self::$cache = array_merge(self::DEFAULTS, is_array($stored) ? $stored : []);
    }

    /** Drop the per-request cache. For tests, and after a settings write. */
    public static function flush(): void
    {
        self::$cache = null;
    }

    public static function proxied(): bool
    {
        return (bool) (self::all()['cloudflare_proxied'] ?? false);
    }

    public static function retries(): int
    {
        return max(0, (int) (self::all()['cloudflare_retries'] ?? 3));
    }

    public static function retrySleepMs(): int
    {
        return max(0, (int) (self::all()['cloudflare_retry_sleep_ms'] ?? 250));
    }

    public static function allowWildcard(): bool
    {
        return (bool) (self::all()['allow_wildcard'] ?? false);
    }

    public static function maxWildcardsPerUser(): int
    {
        return max(0, (int) (self::all()['max_wildcards_per_user'] ?? 1));
    }

    /**
     * The account-wide Cloudflare token, or null when none is configured.
     *
     * A per-domain key overrides this; see CustomDomainApiKey. There is no
     * plaintext fallback — an unconfigured secret reads as absent rather than as
     * an empty token that would produce a confusing 401 from Cloudflare.
     */
    public static function cloudflareToken(): ?string
    {
        return app(ExtensionSecretStore::class)->get(self::EXTENSION_ID, self::SECRET_CLOUDFLARE_TOKEN);
    }
}
