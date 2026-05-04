<?php

namespace Everest\Extensions\Packages\palworld_server_manager\Http\Requests;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

class PalworldServerManagerPresetRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_EXTENSION_READ;
    }

    public function rules(): array
    {
        return [];
    }
}
