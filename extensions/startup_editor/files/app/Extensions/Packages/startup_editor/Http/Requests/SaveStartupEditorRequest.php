<?php

namespace Everest\Extensions\Packages\startup_editor\Http\Requests;

use Everest\Models\Permission;
use Everest\Contracts\Http\ClientPermissionsRequest;
use Everest\Http\Requests\Api\Client\ClientApiRequest;
use Illuminate\Validation\Validator;
use Everest\Extensions\Packages\startup_editor\MinecraftStartupOptions;

/**
 * Validates a preset-based save payload.
 *
 * The payload must contain a list of curated option IDs (strings).
 * Arbitrary raw startup text is no longer accepted; all command text
 * is generated server-side from the validated allowlist.
 */
class SaveStartupEditorRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_STARTUP_UPDATE;
    }

    public function rules(): array
    {
        return [
            'selected_options'   => ['required', 'array', 'max:20'],
            'selected_options.*' => ['required', 'string', 'max:64'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $validIds = MinecraftStartupOptions::getValidOptionIds();

            foreach ($this->input('selected_options', []) as $optionId) {
                if (!in_array($optionId, $validIds, true)) {
                    $v->errors()->add('selected_options', "Unknown or disallowed option: {$optionId}");
                    return;
                }
            }
        });
    }
}
