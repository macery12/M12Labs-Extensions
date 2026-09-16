<?php

namespace Everest\Extensions\Packages\discordsrv_helper\Http\Requests;

use Everest\Extensions\Sdk\Permission;
use Everest\Extensions\Sdk\Http\ClientApiRequest;

class DiscordSrvHelperStatusRequest extends ClientApiRequest
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
        return $this->user()->can(Permission::ACTION_FILE_READ, $server);
    }

    public function rules(): array
    {
        return [];
    }
}
