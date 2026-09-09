<?php

namespace Everest\Extensions\Packages\minecraft_player_manager\Http\Requests;

use Everest\Models\Server;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

/**
 * Base request for every player-manager endpoint.
 *
 * Two layers, and neither substitutes for the other. The extension permission
 * (`extension.read` / `extension.manage`) establishes that this viewer may use
 * the package at all; the core server permissions below establish that they may
 * perform the underlying operation on this server. The package reads and writes
 * ops.json, whitelist.json and the ban lists, and drives the server console —
 * a subuser who holds neither `file.update` nor `control.console` must not
 * acquire them by going through an extension.
 *
 * The previous release enforced only the first layer, and AttributeRequest
 * enforced nothing at all: it declared validation rules and no permission, so
 * ClientApiRequest::authorize() fell through to `true` and any authenticated
 * user who could reach the route could rewrite a player's attributes.
 */
abstract class PlayerManagerRequest extends ClientApiRequest
{
    /**
     * Core server permissions this operation requires in addition to the
     * extension permission returned by permission().
     *
     * @return array<int, string>
     */
    abstract protected function requiredServerPermissions(): array;

    public function authorize(): bool
    {
        if (!parent::authorize()) {
            return false;
        }

        $server = $this->route()->parameter('server');

        if (!$server instanceof Server) {
            return false;
        }

        foreach ($this->requiredServerPermissions() as $permission) {
            if (!$this->user()->can($permission, $server)) {
                return false;
            }
        }

        return true;
    }
}
