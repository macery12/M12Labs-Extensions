<?php

namespace Everest\Extensions\Packages\minecraft_player_manager\Http\Requests;

use Everest\Models\Permission;

/**
 * Kicking a player. Console only.
 */
class KickRequest extends PlayerManagerRequest
{
    public function permission(): string
    {
        return Permission::ACTION_EXTENSION_MANAGE;
    }

    /**
     * A console-only operation: it writes no file, but it does put a command on
     * the server console, which is exactly what control.console governs.
     */
    protected function requiredServerPermissions(): array
    {
        return [Permission::ACTION_CONTROL_CONSOLE];
    }

    public function rules(): array
    {
        return [
            'reason' => 'sometimes|string|max:255',
        ];
    }
}
