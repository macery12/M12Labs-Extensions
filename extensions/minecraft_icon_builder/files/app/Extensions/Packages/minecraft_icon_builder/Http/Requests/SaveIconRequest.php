<?php

namespace Everest\Extensions\Packages\minecraft_icon_builder\Http\Requests;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

/**
 * Writing server-icon.png.
 *
 * Two gates apply and neither substitutes for the other: the extension gate
 * establishes that this viewer may use the package at all, and the core file
 * permissions establish that they may create and overwrite a file on this
 * server. The controller then validates the image itself — the cap here bounds
 * the request body, not the picture.
 */
class SaveIconRequest extends ClientApiRequest
{
    /**
     * Base64 expands by roughly 4/3, so this admits the controller's 256 KiB
     * decoded ceiling with room for the data-URI prefix and nothing more.
     */
    private const MAX_PAYLOAD_CHARS = 360000;

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
                'max:' . self::MAX_PAYLOAD_CHARS,
                function ($attribute, $value, $fail) {
                    if (!str_starts_with($value, 'data:image/png;base64,')) {
                        $fail('The icon must be a PNG data URI.');
                    }
                },
            ],
        ];
    }
}
