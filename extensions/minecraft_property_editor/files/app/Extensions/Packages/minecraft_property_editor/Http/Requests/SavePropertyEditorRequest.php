<?php

namespace Everest\Extensions\Packages\minecraft_property_editor\Http\Requests;

use Everest\Models\Permission;
use Everest\Contracts\Http\ClientPermissionsRequest;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

class SavePropertyEditorRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_FILE_UPDATE;
    }

    public function rules(): array
    {
        return [
            'properties'   => ['required', 'array', 'max:200'],
            'properties.*' => ['required', 'string', 'max:2048'],
            'server_type'  => ['nullable', 'string', 'in:vanilla,spigot,paper,fabric,forge,neoforge'],
            'mc_version'   => ['nullable', 'string', 'max:20', 'regex:/^\d+\.\d+(\.\d+)?$/'],
        ];
    }
}
