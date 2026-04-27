<?php

namespace Everest\Extensions\Packages\minecraft_version_changer\Http\Requests;

use Everest\Models\Permission;
use Everest\Contracts\Http\ClientPermissionsRequest;
use Everest\Http\Requests\Api\Client\ClientApiRequest;
use Illuminate\Validation\Validator;

class SwitchVersionRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_STARTUP_UPDATE;
    }

    public function rules(): array
    {
        return [
            'loader'            => ['required', 'string', 'in:vanilla,paper,fabric,forge'],
            'mc_version'        => ['required', 'string', 'regex:/^[0-9]+\.[0-9]+(\.[0-9]+)?$/'],
            // Paper: numeric build number
            'build'             => ['nullable', 'integer', 'min:1'],
            // Fabric: loader and installer semantic versions
            'loader_version'    => ['nullable', 'string', 'max:32', 'regex:/^[0-9]+\.[0-9]+\.[0-9]+$/'],
            'installer_version' => ['nullable', 'string', 'max:32', 'regex:/^[0-9]+\.[0-9]+(\.[0-9]+)?$/'],
            // Forge: forge build version string (e.g. "49.0.14")
            'forge_version'     => ['nullable', 'string', 'max:32', 'regex:/^[0-9]+\.[0-9]+(\.[0-9]+)?$/'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $loader = $this->input('loader');

            switch ($loader) {
                case 'paper':
                    if (!$this->filled('build')) {
                        $v->errors()->add('build', 'A build number is required for Paper.');
                    }
                    break;

                case 'fabric':
                    if (!$this->filled('loader_version') || !$this->filled('installer_version')) {
                        $v->errors()->add('loader_version', 'Loader version and installer version are required for Fabric.');
                    }
                    break;

                case 'forge':
                    if (!$this->filled('forge_version')) {
                        $v->errors()->add('forge_version', 'A Forge version is required for Forge.');
                    }
                    break;
            }
        });
    }
}
