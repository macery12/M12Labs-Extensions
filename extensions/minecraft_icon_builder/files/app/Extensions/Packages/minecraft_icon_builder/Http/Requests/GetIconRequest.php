<?php

namespace Everest\Extensions\Packages\minecraft_icon_builder\Http\Requests;

use Everest\Extensions\Sdk\Permission;
use Everest\Extensions\Sdk\Http\ClientApiRequest;

class GetIconRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_EXTENSION_READ;
    }

    public function authorize(): bool
    {
        if (!parent::authorize()) {
            return false;
        }

        $server = $this->route()->parameter('server');
        return $this->user()->can(Permission::ACTION_FILE_READ_CONTENT, $server);
    }

    public function rules(): array
    {
        return [];
    }
}
