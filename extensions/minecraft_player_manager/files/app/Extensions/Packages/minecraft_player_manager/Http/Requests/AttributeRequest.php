<?php

namespace Everest\Extensions\Packages\minecraft_player_manager\Http\Requests;

use Everest\Extensions\Sdk\Permission;

/**
 * Setting a player attribute.
 *
 * Console only, but emphatically a mutation: the previous release declared
 * validation rules and no permission at all, which left the endpoint open to
 * any authenticated user who could reach it.
 */
class AttributeRequest extends PlayerManagerRequest
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
            'value' => 'required|numeric',
        ];
    }
}
