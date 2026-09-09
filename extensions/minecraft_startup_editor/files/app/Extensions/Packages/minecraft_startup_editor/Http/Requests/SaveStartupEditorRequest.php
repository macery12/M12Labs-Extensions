<?php

namespace Everest\Extensions\Packages\minecraft_startup_editor\Http\Requests;

use Everest\Models\Server;
use Everest\Models\Permission;
use Illuminate\Validation\Validator;
use Everest\Contracts\Http\ClientPermissionsRequest;
use Everest\Http\Requests\Api\Client\ClientApiRequest;
use Everest\Extensions\Packages\minecraft_startup_editor\MinecraftStartupOptions;

/**
 * Validates a preset-based save payload.
 *
 * The payload carries a list of curated option IDs; arbitrary raw startup text
 * is never accepted, and every command string is generated server-side from the
 * validated allowlist.
 */
class SaveStartupEditorRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    /** Absolute ceilings, applied when a server has no memory limit of its own. */
    private const MAX_XMS_MB = 16384;

    private const MAX_XMX_MB = 65536;

    /**
     * Heap the JVM may claim of a bounded allocation, as a percentage.
     *
     * A Java process needs room outside the heap — metaspace, thread stacks,
     * code cache, direct buffers — and the container is killed, not throttled,
     * when the total is exceeded. Sizing the heap to the whole limit therefore
     * produces a server that starts and then dies under load.
     */
    private const HEAP_BUDGET_PERCENT = 85;

    /** Below this the headroom percentage leaves too little to start at all. */
    private const MIN_BUDGET_MB = 64;

    public function permission(): string
    {
        return Permission::ACTION_STARTUP_UPDATE;
    }

    public function rules(): array
    {
        return [
            'selected_options' => ['required', 'array', 'max:20'],
            'selected_options.*' => ['required', 'string', 'max:64'],
            'xms_mb' => ['nullable', 'integer', 'min:64', 'max:' . self::MAX_XMS_MB],
            'xmx_mb' => ['nullable', 'integer', 'min:64', 'max:' . self::MAX_XMX_MB],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $validIds = MinecraftStartupOptions::getValidOptionIds();

            foreach ($this->input('selected_options', []) as $optionId) {
                if (!in_array($optionId, $validIds, true)) {
                    $v->errors()->add('selected_options', 'One of the selected options is not recognised.');

                    return;
                }
            }

            $xmsMb = (int) ($this->input('xms_mb') ?? 256);
            $xmxMb = (int) ($this->input('xmx_mb') ?? 1024);

            if ($xmxMb < $xmsMb) {
                $v->errors()->add('xmx_mb', 'Maximum heap (Xmx) must be greater than or equal to initial heap (Xms).');
            }

            // The absolute maxima above are a sanity bound, not an entitlement.
            // What a server may actually claim is its own allocation, so a
            // 2 GiB server cannot be configured with a 64 GiB heap and then
            // fail to boot with an out-of-memory kill that looks like a panel
            // bug rather than a configuration one.
            $budget = $this->heapBudgetMb();

            if ($budget !== null && $xmxMb > $budget) {
                $v->errors()->add('xmx_mb', sprintf('Maximum heap (Xmx) may not exceed %d MB on this server, which is allocated %d MB.', $budget, $this->serverMemoryMb()));
            }

            if ($budget !== null && $xmsMb > $budget) {
                $v->errors()->add('xms_mb', sprintf('Initial heap (Xms) may not exceed %d MB on this server, which is allocated %d MB.', $budget, $this->serverMemoryMb()));
            }
        });
    }

    /**
     * The largest heap this server's allocation supports, or null when the
     * server is unlimited and only the absolute ceiling applies.
     */
    private function heapBudgetMb(): ?int
    {
        $memory = $this->serverMemoryMb();

        if ($memory <= 0) {
            return null;
        }

        return max(self::MIN_BUDGET_MB, (int) floor($memory * self::HEAP_BUDGET_PERCENT / 100));
    }

    private function serverMemoryMb(): int
    {
        $server = $this->route()->parameter('server');

        return $server instanceof Server ? (int) $server->memory : 0;
    }
}
