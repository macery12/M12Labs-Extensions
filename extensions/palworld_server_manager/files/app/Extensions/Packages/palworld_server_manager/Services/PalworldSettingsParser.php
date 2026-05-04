<?php

namespace Everest\Extensions\Packages\palworld_server_manager\Services;

use Illuminate\Support\Facades\Log;

class PalworldSettingsParser
{
    private const SETTINGS_FILE = 'Pal/Saved/Config/LinuxServer/PalWorldSettings.ini';

    private const SECTION_HEADER = '[/Script/Pal.PalGameWorldSettings]';

    /**
     * Fields that should be serialized with surrounding quotes.
     */
    private const QUOTED_FIELDS = [
        'ServerName',
        'ServerDescription',
        'AdminPassword',
        'ServerPassword',
        'PublicIP',
        'Region',
        'BanListURL',
    ];

    /**
     * Fields whose values are boolean (True/False).
     */
    private const BOOL_FIELDS = [
        'bEnablePlayerToPlayerDamage',
        'bEnableFriendlyFire',
        'bEnableInvaderEnemy',
        'bActiveUNKO',
        'bEnableAimAssistPad',
        'bEnableAimAssistKeyboard',
        'bAutoResetGuildNoOnlinePlayers',
        'bIsMultiplay',
        'bIsPvP',
        'bCanPickupOtherGuildDeathPenaltyDrop',
        'bEnableNonLoginPenalty',
        'bEnableFastTravel',
        'bIsStartLocationSelectByMap',
        'bExistPlayerAfterLogout',
        'bEnableDefenseOtherGuildPlayer',
        'RCONEnabled',
        'bUseAuth',
        'RESTAPIEnabled',
        'bShowPlayerList',
        'bIsUseBackupSaveData',
    ];

    /**
     * Fields whose values are integers (no decimal places).
     */
    private const INT_FIELDS = [
        'DropItemMaxNum',
        'DropItemMaxNum_UNKO',
        'BaseCampMaxNum',
        'BaseCampWorkerMaxNum',
        'GuildPlayerMaxNum',
        'CoopPlayerMaxNum',
        'ServerPlayerMaxNum',
        'PublicPort',
        'RCONPort',
        'RESTAPIPort',
        'ChatPostLimitNumOfTimes',
        'ChatPostIntervalSeconds',
        'SupplyDropSpan',
    ];

    /**
     * Default settings to return when the file is missing or a key is absent.
     *
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'Difficulty'                          => 'None',
            'DayTimeSpeedRate'                    => 1.0,
            'NightTimeSpeedRate'                  => 1.0,
            'ExpRate'                             => 1.0,
            'PalCaptureRate'                      => 1.0,
            'PalSpawnNumRate'                     => 1.0,
            'PalDamageRateAttack'                 => 1.0,
            'PalDamageRateDefense'                => 1.0,
            'PlayerDamageRateAttack'              => 1.0,
            'PlayerDamageRateDefense'             => 1.0,
            'PlayerStomachDecreaceRate'           => 1.0,
            'PlayerStaminaDecreaceRate'           => 1.0,
            'PlayerAutoHPRegeneRate'              => 1.0,
            'PlayerAutoHpRegeneRateInSleep'       => 1.0,
            'PalStomachDecreaceRate'              => 1.0,
            'PalStaminaDecreaceRate'              => 1.0,
            'PalAutoHPRegeneRate'                 => 1.0,
            'PalAutoHpRegeneRateInSleep'          => 1.0,
            'BuildObjectDamageRate'               => 1.0,
            'BuildObjectDeteriorationDamageRate'  => 1.0,
            'CollectionDropRate'                  => 1.0,
            'CollectionObjectHpRate'              => 1.0,
            'CollectionObjectRespawnSpeedRate'    => 1.0,
            'EnemyDropItemRate'                   => 1.0,
            'DeathPenalty'                        => 'All',
            'bEnablePlayerToPlayerDamage'         => false,
            'bEnableFriendlyFire'                 => false,
            'bEnableInvaderEnemy'                 => true,
            'bActiveUNKO'                         => false,
            'bEnableAimAssistPad'                 => true,
            'bEnableAimAssistKeyboard'            => false,
            'DropItemMaxNum'                      => 3000,
            'DropItemMaxNum_UNKO'                 => 100,
            'BaseCampMaxNum'                      => 128,
            'BaseCampWorkerMaxNum'                => 15,
            'DropItemAliveMaxHours'               => 1.0,
            'bAutoResetGuildNoOnlinePlayers'      => false,
            'AutoResetGuildTimeNoOnlinePlayers'   => 72.0,
            'GuildPlayerMaxNum'                   => 20,
            'PalEggDefaultHatchingTime'           => 72.0,
            'WorkSpeedRate'                       => 1.0,
            'bIsMultiplay'                        => false,
            'bIsPvP'                              => false,
            'bCanPickupOtherGuildDeathPenaltyDrop' => false,
            'bEnableNonLoginPenalty'              => true,
            'bEnableFastTravel'                   => true,
            'bIsStartLocationSelectByMap'         => true,
            'bExistPlayerAfterLogout'             => false,
            'bEnableDefenseOtherGuildPlayer'      => false,
            'CoopPlayerMaxNum'                    => 4,
            'ServerPlayerMaxNum'                  => 32,
            'ServerName'                          => 'Default Palworld Server',
            'ServerDescription'                   => '',
            'AdminPassword'                       => '',
            'ServerPassword'                      => '',
            'PublicPort'                          => 8211,
            'PublicIP'                            => '',
            'RCONEnabled'                         => false,
            'RCONPort'                            => 25575,
            'Region'                              => '',
            'bUseAuth'                            => true,
            'BanListURL'                          => 'https://api.palworldgame.com/api/banlist.txt',
            'RESTAPIEnabled'                      => false,
            'RESTAPIPort'                         => 8212,
            'bShowPlayerList'                     => false,
            'ChatPostLimitNumOfTimes'             => 10,
            'ChatPostIntervalSeconds'             => 2,
            'bIsUseBackupSaveData'                => true,
            'LogFormatType'                       => 'Text',
            'SupplyDropSpan'                      => 180,
        ];
    }

    /**
     * Parse a PalWorldSettings.ini file content into an associative array of settings.
     * Returns defaults merged with any parsed values on failure.
     *
     * @return array<string, mixed>
     */
    public function parse(string $iniContent): array
    {
        $defaults = self::defaults();

        if (trim($iniContent) === '') {
            return $defaults;
        }

        // Extract the OptionSettings=(...) value
        if (!preg_match('/OptionSettings=\((.+)\)/s', $iniContent, $matches)) {
            Log::warning('[palworld_server_manager] Could not locate OptionSettings=(...) in ini content.');
            return $defaults;
        }

        $raw = $matches[1];
        $tokens = $this->tokenize($raw);

        $parsed = [];
        foreach ($tokens as $token) {
            $eqPos = strpos($token, '=');
            if ($eqPos === false) {
                continue;
            }

            $key   = substr($token, 0, $eqPos);
            $value = substr($token, $eqPos + 1);

            $parsed[$key] = $this->castValue($key, $value);
        }

        return array_merge($defaults, $parsed);
    }

    /**
     * Rebuild the full INI file content from a settings array.
     * Preserves the section header and replaces (or creates) the OptionSettings line.
     *
     * @param array<string, mixed> $settings
     */
    public function serialize(array $settings, string $originalContent): string
    {
        $parts = [];
        foreach ($settings as $key => $value) {
            $parts[] = $key . '=' . $this->formatValue($key, $value);
        }

        $optionLine = 'OptionSettings=(' . implode(',', $parts) . ')';

        // If there is already an OptionSettings line, replace it
        if (preg_match('/OptionSettings=\(.+\)/s', $originalContent)) {
            $new = preg_replace('/OptionSettings=\(.+\)/s', $optionLine, $originalContent);
            return $new ?? ($this->buildFreshContent($optionLine));
        }

        // If the section header exists, append after it
        if (str_contains($originalContent, self::SECTION_HEADER)) {
            return rtrim($originalContent) . "\n" . $optionLine . "\n";
        }

        return $this->buildFreshContent($optionLine);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Tokenize the content inside OptionSettings=(...), correctly handling
     * quoted strings that may contain commas.
     *
     * @return list<string>
     */
    private function tokenize(string $raw): array
    {
        $tokens = [];
        $current = '';
        $inQuote = false;

        for ($i = 0, $len = strlen($raw); $i < $len; $i++) {
            $char = $raw[$i];

            if ($char === '"') {
                $inQuote = !$inQuote;
                $current .= $char;
            } elseif ($char === ',' && !$inQuote) {
                $tokens[] = trim($current);
                $current  = '';
            } else {
                $current .= $char;
            }
        }

        if (trim($current) !== '') {
            $tokens[] = trim($current);
        }

        return $tokens;
    }

    /**
     * Cast a raw string value to the appropriate PHP type.
     *
     * @return mixed
     */
    private function castValue(string $key, string $raw): mixed
    {
        // Unquote string values
        if (str_starts_with($raw, '"') && str_ends_with($raw, '"')) {
            return substr($raw, 1, -1);
        }

        // Booleans
        if (strtolower($raw) === 'true') {
            return true;
        }
        if (strtolower($raw) === 'false') {
            return false;
        }

        // Integer fields
        if (in_array($key, self::INT_FIELDS, true) && ctype_digit($raw)) {
            return (int) $raw;
        }

        // Numeric (float)
        if (is_numeric($raw)) {
            return str_contains($raw, '.') ? (float) $raw : (int) $raw;
        }

        return $raw;
    }

    /**
     * Format a PHP value back to its INI string representation.
     */
    private function formatValue(string $key, mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'True' : 'False';
        }

        if (in_array($key, self::QUOTED_FIELDS, true)) {
            $escaped = str_replace('"', '\\"', (string) $value);
            return '"' . $escaped . '"';
        }

        if (in_array($key, self::INT_FIELDS, true)) {
            return (string) (int) $value;
        }

        if (is_float($value) || (is_numeric($value) && str_contains((string) $value, '.'))) {
            // Palworld's own generator writes 6 decimal places (e.g. 1.000000).
            // Using the same precision keeps the file indistinguishable from a server-generated one.
            return number_format((float) $value, 6, '.', '');
        }

        if (is_int($value)) {
            return (string) $value;
        }

        return (string) $value;
    }

    private function buildFreshContent(string $optionLine): string
    {
        return self::SECTION_HEADER . "\n" . $optionLine . "\n";
    }
}
