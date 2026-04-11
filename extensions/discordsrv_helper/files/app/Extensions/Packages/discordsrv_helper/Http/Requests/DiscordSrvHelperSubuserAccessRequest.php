<?php

namespace Everest\Extensions\Packages\discordsrv_helper\Http\Requests;

class DiscordSrvHelperSubuserAccessRequest extends DiscordSrvHelperOwnerRequest
{
    public function rules(): array
    {
        return [
            'enabled' => 'required|boolean',
        ];
    }
}
