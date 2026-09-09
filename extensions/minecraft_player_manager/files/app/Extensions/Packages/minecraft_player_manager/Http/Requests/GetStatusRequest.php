<?php

namespace Everest\Extensions\Packages\minecraft_player_manager\Http\Requests;

use Everest\Models\Permission;

/**
 * Server status, version and the attribute catalog.
 *
 * Reads ops.json, whitelist.json, the ban lists and server.properties.
 */
class GetStatusRequest extends PlayerManagerRequest
{
    public function permission(): string
    {
        return Permission::ACTION_EXTENSION_READ;
    }

    /**
     * Reading player state means reading the server's own JSON and NBT files,
     * so it answers to file.read-content — file.read only permits listing a
     * directory.
     */
    protected function requiredServerPermissions(): array
    {
        return [Permission::ACTION_FILE_READ_CONTENT];
    }

    public function rules(): array
    {
        return [];
    }
}
