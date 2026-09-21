<?php

namespace Everest\Extensions\Packages\ai\Http\Requests\Client;

use Everest\Extensions\Sdk\Permission;
use Everest\Extensions\Sdk\Http\ClientApiRequest;

/**
 * The gate on every server-side assistant endpoint.
 *
 * `websocket.connect` is the weakest permission that means anything here: it
 * is what lets somebody open this server at all, and the assistant is a
 * console-adjacent feature rather than a privileged one.
 *
 * Deliberately not the union of everything the agent can do. Each tool
 * dispatches a real sub-request through the panel's own middleware as the
 * acting user, so a subuser who may read files but not restart the server gets
 * exactly that from the assistant, refused at the same place it would be
 * refused in the UI. Gating entry on the strongest permission any tool might
 * need would instead hide the whole feature from everyone who cannot do
 * everything.
 */
abstract class ServerAgentRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_WEBSOCKET_CONNECT;
    }
}
