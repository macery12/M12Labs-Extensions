<?php

namespace Everest\Extensions\Packages\valheim_world_manager\Http\Requests;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

class ValheimWorldManagerToggleModRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_EXTENSION_MANAGE;
    }

    public function authorize(): bool
    {
        if (!parent::authorize()) {
            return false;
        }

        $server = $this->route()->parameter('server');

        return $this->user()->can(Permission::ACTION_FILE_CREATE, $server)
            && $this->user()->can(Permission::ACTION_FILE_UPDATE, $server)
            && $this->user()->can(Permission::ACTION_FILE_READ_CONTENT, $server);
    }

    public function rules(): array
    {
        return [];
    }
}
