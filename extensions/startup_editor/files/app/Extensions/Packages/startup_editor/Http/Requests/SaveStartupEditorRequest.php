<?php

namespace Everest\Extensions\Packages\startup_editor\Http\Requests;

use Everest\Models\Permission;
use Everest\Contracts\Http\ClientPermissionsRequest;
use Everest\Http\Requests\Api\Client\ClientApiRequest;
use Illuminate\Validation\Validator;

class SaveStartupEditorRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    private const SHELL_INJECTION_PATTERN = '/[;`]|\|\|?|&&|\$[({]/';

    private const DISALLOWED_PATH_PATTERN = '/(?:^|\s)(\/(?:bin|etc|usr|var|root|proc|sys)\/)/';

    public function permission(): string
    {
        return Permission::ACTION_STARTUP_UPDATE;
    }

    public function rules(): array
    {
        return [
            'startup' => ['required', 'string', 'max:2048'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $startup = $this->input('startup', '');

            if (str_contains($startup, "\0")) {
                $v->errors()->add('startup', 'Startup command contains a null byte.');
                return;
            }

            if (preg_match(self::SHELL_INJECTION_PATTERN, $startup)) {
                $v->errors()->add('startup', 'Startup command contains shell injection characters.');
                return;
            }

            if (preg_match(self::DISALLOWED_PATH_PATTERN, $startup)) {
                $v->errors()->add('startup', 'Startup command references a disallowed system path.');
                return;
            }

            $trimmed = trim($startup);
            if ($trimmed !== '' && !str_starts_with($trimmed, 'java') && !str_starts_with($trimmed, '{{')) {
                $v->errors()->add('startup', "Startup command must begin with 'java' or a valid egg variable reference.");
            }
        });
    }
}
