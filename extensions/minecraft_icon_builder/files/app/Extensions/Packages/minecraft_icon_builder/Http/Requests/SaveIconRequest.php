<?php

namespace Everest\Extensions\Packages\minecraft_icon_builder\Http\Requests;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

class SaveIconRequest extends ClientApiRequest
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
            && $this->user()->can(Permission::ACTION_FILE_UPDATE, $server);
    }

    public function rules(): array
    {
        return [
            'image_base64' => [
                'required',
                'string',
                'max:200000',
                function ($attribute, $value, $fail) {
                    if (!str_starts_with($value, 'data:image/png;base64,')) {
                        $fail('The icon must be a PNG data URI.');
                    }
                },
            ],
        ];
    }
}
