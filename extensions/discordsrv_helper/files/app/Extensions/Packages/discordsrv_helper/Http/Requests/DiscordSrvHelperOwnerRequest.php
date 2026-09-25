<?php

namespace Everest\Extensions\Packages\discordsrv_helper\Http\Requests;

use Everest\Extensions\Sdk\Permission;
use Everest\Extensions\Sdk\Http\ClientApiRequest;

class DiscordSrvHelperOwnerRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_EXTENSION_MANAGE;
    }

    public function authorize(): bool
    {
        $server = $this->route()->parameter('server');
        $user = $this->user();

        if (!$server instanceof \Everest\Models\Server) {
            return false;
        }

        if (!$user->root_admin && $user->id !== $server->owner_id) {
            return false;
        }

        return parent::authorize();
    }

    public function rules(): array
    {
        return [];
    }
}
