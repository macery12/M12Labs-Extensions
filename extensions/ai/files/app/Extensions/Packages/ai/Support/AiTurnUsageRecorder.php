<?php

namespace Everest\Extensions\Packages\ai\Support;

use Everest\Extensions\Packages\ai\Models\AiUsageLog;

/** Store the latest cumulative snapshot for one logical agent turn. */
class AiTurnUsageRecorder
{
    /**
     * @param array<string, mixed> $attributes
     */
    public function record(string $turnId, array $attributes): AiUsageLog
    {
        return AiUsageLog::updateOrCreate(['turn_id' => $turnId], $attributes);
    }
}
