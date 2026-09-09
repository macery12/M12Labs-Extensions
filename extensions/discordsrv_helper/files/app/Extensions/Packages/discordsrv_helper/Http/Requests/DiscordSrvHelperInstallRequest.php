<?php

namespace Everest\Extensions\Packages\discordsrv_helper\Http\Requests;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

/**
 * Installing the DiscordSRV jar.
 *
 * Takes no input. The previous release accepted a `jar_url`, which made the
 * caller the one who decided what the panel and the daemon would fetch; the
 * source is now pinned in the controller and there is nothing here to supply.
 *
 * Two gates apply and neither substitutes for the other: the extension gate
 * establishes that this viewer may use the package, and the core file
 * permissions establish that they may write to this server's filesystem.
 */
class DiscordSrvHelperInstallRequest extends ClientApiRequest
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
        return [];
    }
}
