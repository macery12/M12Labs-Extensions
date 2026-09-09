<?php

namespace Everest\Extensions\Packages\minecraft_player_manager\Http\Requests;

use Everest\Models\Permission;

/**
 * Revoking operator status, removing a whitelist entry, or lifting a ban.
 *
 * Writes the relevant JSON file and issues the matching console command.
 */
class PlayerRequest extends PlayerManagerRequest
{
    public function permission(): string
    {
        return Permission::ACTION_EXTENSION_MANAGE;
    }

    /**
     * These operations rewrite a server file (ops.json, whitelist.json, a ban
     * list or server.properties) and then issue the paired console command, so
     * they require the permissions for both halves.
     */
    protected function requiredServerPermissions(): array
    {
        return [
            Permission::ACTION_FILE_READ_CONTENT,
            Permission::ACTION_FILE_UPDATE,
            Permission::ACTION_CONTROL_CONSOLE,
        ];
    }

    public function rules(): array
    {
        return [];
    }
}
