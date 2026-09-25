<?php

namespace Everest\Extensions\Packages\ai\Http\Requests;

use Everest\Extensions\Packages\ai\Tools\ToolDefinition;
use Everest\Extensions\Sdk\Http\ApplicationApiRequest;

class UpdateAiToolsRequest extends ApplicationApiRequest
{
    public function rules(): array
    {
        return [
            'risk_overrides' => 'present|array',
            'risk_overrides.*' => 'string|in:' . implode(',', ToolDefinition::RISKS),

            'disabled_tools' => 'present|array',
            'disabled_tools.*' => 'string|max:64',

            // Additions to the built-in safe list. Length-capped and
            // single-line: a command carrying a newline could smuggle a second,
            // unvetted command past the gate.
            'console_safe_commands' => 'present|array|max:200',
            'console_safe_commands.*' => 'string|max:64|regex:/^[^\r\n\x00]+$/',
        ];
    }

    public function permission(): string
    {
        return 'ext.ai.admin.update';
    }
}
