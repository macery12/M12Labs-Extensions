<?php

namespace Everest\Extensions\Packages\minecraft_log_uploader\Http\Requests;

use Everest\Models\Permission;
use Everest\Contracts\Http\ClientPermissionsRequest;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

/**
 * Listing the log directory.
 *
 * This endpoint returns names, sizes and timestamps and no file contents, so
 * file.read — the directory-listing permission — is the right gate. Reading or
 * uploading a log answers to file.read-content instead.
 */
class ListLogsRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_FILE_READ;
    }
}
