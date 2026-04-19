<?php

namespace Everest\Extensions\Packages\startup_editor\Http\Requests;

use Everest\Models\Permission;
use Everest\Contracts\Http\ClientPermissionsRequest;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

class GetStartupEditorRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_STARTUP_READ;
    }
}
