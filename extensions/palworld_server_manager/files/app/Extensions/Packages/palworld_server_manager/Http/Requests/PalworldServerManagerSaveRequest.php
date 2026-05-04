<?php

namespace Everest\Extensions\Packages\palworld_server_manager\Http\Requests;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

class PalworldServerManagerSaveRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_EXTENSION_MANAGE;
    }

    public function rules(): array
    {
        return [
            // Server
            'ServerName'                          => 'required|string|max:255',
            'ServerDescription'                   => 'nullable|string|max:255',
            'AdminPassword'                       => 'nullable|string|max:255',
            'ServerPassword'                      => 'nullable|string|max:255',
            'ServerPlayerMaxNum'                  => 'required|integer|min:1|max:32',
            'CoopPlayerMaxNum'                    => 'required|integer|min:1|max:32',
            'PublicPort'                          => 'required|integer|min:1|max:65535',

            // Gameplay
            'Difficulty'                          => 'required|string|in:None,Normal,Difficult',
            'DeathPenalty'                        => 'required|string|in:None,Item,ItemAndEquipment,All',
            'bIsPvP'                              => 'required|boolean',
            'bEnablePlayerToPlayerDamage'         => 'required|boolean',
            'bEnableFriendlyFire'                 => 'required|boolean',
            'bEnableInvaderEnemy'                 => 'required|boolean',
            'bEnableNonLoginPenalty'              => 'required|boolean',
            'bEnableFastTravel'                   => 'required|boolean',
            'bIsStartLocationSelectByMap'         => 'required|boolean',
            'bExistPlayerAfterLogout'             => 'required|boolean',
            'bEnableDefenseOtherGuildPlayer'      => 'required|boolean',

            // Rates
            'DayTimeSpeedRate'                    => 'required|numeric|min:0',
            'NightTimeSpeedRate'                  => 'required|numeric|min:0',
            'ExpRate'                             => 'required|numeric|min:0',
            'PalCaptureRate'                      => 'required|numeric|min:0',
            'PalSpawnNumRate'                     => 'required|numeric|min:0',
            'PalDamageRateAttack'                 => 'required|numeric|min:0',
            'PalDamageRateDefense'                => 'required|numeric|min:0',
            'PlayerDamageRateAttack'              => 'required|numeric|min:0',
            'PlayerDamageRateDefense'             => 'required|numeric|min:0',
            'WorkSpeedRate'                       => 'required|numeric|min:0',
            'CollectionDropRate'                  => 'required|numeric|min:0',
            'CollectionObjectHpRate'              => 'required|numeric|min:0',
            'CollectionObjectRespawnSpeedRate'    => 'required|numeric|min:0',
            'EnemyDropItemRate'                   => 'required|numeric|min:0',

            // Survival
            'PlayerStomachDecreaceRate'           => 'required|numeric|min:0',
            'PlayerStaminaDecreaceRate'           => 'required|numeric|min:0',
            'PlayerAutoHPRegeneRate'              => 'required|numeric|min:0',
            'PlayerAutoHpRegeneRateInSleep'       => 'required|numeric|min:0',
            'PalStomachDecreaceRate'              => 'required|numeric|min:0',
            'PalStaminaDecreaceRate'              => 'required|numeric|min:0',
            'PalAutoHPRegeneRate'                 => 'required|numeric|min:0',
            'PalAutoHpRegeneRateInSleep'          => 'required|numeric|min:0',

            // World
            'DropItemMaxNum'                      => 'required|integer|min:0',
            'DropItemAliveMaxHours'               => 'required|numeric|min:0',
            'BuildObjectDamageRate'               => 'required|numeric|min:0',
            'BuildObjectDeteriorationDamageRate'  => 'required|numeric|min:0',
            'BaseCampMaxNum'                      => 'required|integer|min:1',
            'BaseCampWorkerMaxNum'                => 'required|integer|min:1',
            'GuildPlayerMaxNum'                   => 'required|integer|min:1',
            'PalEggDefaultHatchingTime'           => 'required|numeric|min:0',
            'SupplyDropSpan'                      => 'required|integer|min:0',
            'bAutoResetGuildNoOnlinePlayers'      => 'required|boolean',
            'AutoResetGuildTimeNoOnlinePlayers'   => 'required|numeric|min:0',
            'bIsUseBackupSaveData'                => 'required|boolean',
        ];
    }
}
