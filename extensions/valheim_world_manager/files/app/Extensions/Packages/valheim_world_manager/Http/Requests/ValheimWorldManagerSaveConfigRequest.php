<?php

namespace Everest\Extensions\Packages\valheim_world_manager\Http\Requests;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

class ValheimWorldManagerSaveConfigRequest extends ClientApiRequest
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

        return $this->user()->can(Permission::ACTION_FILE_UPDATE, $server)
            && $this->user()->can(Permission::ACTION_FILE_READ_CONTENT, $server);
    }

    public function rules(): array
    {
        return [
            'server_name' => 'required|string|max:64',
            'world_name' => 'required|string|max:64|regex:/^[a-zA-Z0-9_\-]+$/',
            'password' => 'nullable|string|min:5',
            'public' => 'required|boolean',
            'crossplay' => 'required|boolean',
            'modifier_combat' => 'required|string|in:veryeasy,easy,standard,hard,veryhard',
            'modifier_deathpenalty' => 'required|string|in:casual,easy,standard,hard,hardcore',
            'modifier_resources' => 'required|string|in:muchless,less,standard,more,muchmore,most',
            'modifier_raids' => 'required|string|in:none,less,standard,more',
            'modifier_portals' => 'required|string|in:casual,standard,hard,veryhard',
        ];
    }
}
