<?php

namespace Everest\Extensions\Packages\ai\Http\Requests;

use Everest\Extensions\Sdk\Http\ApplicationApiRequest;

/**
 * A live inference can load a local model and is more than a read-only status
 * check, so only administrators allowed to change the AI connection may run it.
 */
class ProbeToolCallingRequest extends ApplicationApiRequest
{
    public function permission(): string
    {
        return 'ext.ai.admin.update';
    }
}
