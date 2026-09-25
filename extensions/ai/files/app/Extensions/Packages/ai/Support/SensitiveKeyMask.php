<?php

namespace Everest\Extensions\Packages\ai\Support;

/**
 * Mask values whose *key* names something sensitive, before writing a payload
 * to an audit row.
 *
 * Distinct from {@see \Everest\Extensions\Sdk\Services\PackageRedaction}, which
 * finds sensitive things by their shape -- an email, an IP, a token-looking
 * string -- anywhere in a body of text. This works the other way round and asks
 * only what a field is called, which is what you want for a settings payload:
 * an API key is not recognisable as one, but the field it arrived in is called
 * `key`.
 *
 * Substring matching, deliberately, so `api_key`, `stripe_secret_key` and
 * `keyId` are all caught by `key`. Over-masking an audit row is the safe
 * direction to be wrong in.
 *
 * A local copy of the panel's own helper. It is nine lines of pure array walk
 * with no panel dependency, so wrapping it in an SDK facade would be more
 * machinery than the thing it wraps.
 */
final class SensitiveKeyMask
{
    public const REDACTED = '********';

    /** The field names a settings payload should never record verbatim. */
    public const SETTINGS_KEYS = ['api_key', 'token', 'secret', 'password', 'authorization', 'key'];

    /**
     * @param array<array-key, mixed> $payload
     * @param array<int, string> $sensitiveKeys
     *
     * @return array<array-key, mixed>
     */
    public static function apply(array $payload, array $sensitiveKeys): array
    {
        foreach ($payload as $key => $value) {
            foreach ($sensitiveKeys as $sensitive) {
                if (stripos((string) $key, $sensitive) !== false) {
                    $payload[$key] = self::REDACTED;
                    continue 2;
                }
            }

            if (is_array($value)) {
                $payload[$key] = self::apply($value, $sensitiveKeys);
            }
        }

        return $payload;
    }
}
