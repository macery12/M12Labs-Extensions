<?php

namespace Everest\Extensions\Packages\palworld_server_manager\Http\Requests;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

class PalworldServerManagerApplyPresetRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_EXTENSION_MANAGE;
    }

    public function rules(): array
    {
        return [
            'preset_id' => 'required|string|in:casual,normal,hardcore',
        ];
    }
}
