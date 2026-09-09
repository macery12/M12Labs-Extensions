<?php

namespace Everest\Extensions\Packages\minecraft_log_uploader\Http\Requests;

use Everest\Models\Permission;
use Everest\Contracts\Http\ClientPermissionsRequest;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

class UploadLogRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    /**
     * Reading a log discloses the file's contents, not just its existence.
     *
     * file.read permits listing a directory; file.read-content is the
     * permission that governs reading a file body, which is exactly what this
     * endpoint returns. The two were conflated here, so a subuser granted only
     * directory listing could read — and publish — server logs.
     */
    public function permission(): string
    {
        return Permission::ACTION_FILE_READ_CONTENT;
    }

    public function rules(): array
    {
        return [
            'file' => ['required', 'string', 'max:128'],
        ];
    }
}
