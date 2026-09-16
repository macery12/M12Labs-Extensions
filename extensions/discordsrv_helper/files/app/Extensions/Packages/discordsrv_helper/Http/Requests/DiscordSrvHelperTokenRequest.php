<?php

namespace Everest\Extensions\Packages\discordsrv_helper\Http\Requests;

use Everest\Extensions\Sdk\Permission;
use Everest\Extensions\Sdk\Http\ClientApiRequest;

class DiscordSrvHelperTokenRequest extends ClientApiRequest
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
        return [
            'token' => 'required|string|min:30|max:200',
        ];
    }
}
