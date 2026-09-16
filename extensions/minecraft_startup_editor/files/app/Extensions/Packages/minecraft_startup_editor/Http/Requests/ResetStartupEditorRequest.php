<?php

namespace Everest\Extensions\Packages\minecraft_startup_editor\Http\Requests;

use Everest\Extensions\Sdk\Permission;
use Everest\Extensions\Sdk\Http\ClientPermissionsRequest;
use Everest\Extensions\Sdk\Http\ClientApiRequest;

class ResetStartupEditorRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_STARTUP_UPDATE;
    }
}
