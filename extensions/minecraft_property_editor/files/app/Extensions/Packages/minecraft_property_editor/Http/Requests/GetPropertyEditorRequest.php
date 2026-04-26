<?php

namespace Everest\Extensions\Packages\minecraft_property_editor\Http\Requests;

use Everest\Models\Permission;
use Everest\Contracts\Http\ClientPermissionsRequest;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

class GetPropertyEditorRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_FILE_READ;
    }
}
