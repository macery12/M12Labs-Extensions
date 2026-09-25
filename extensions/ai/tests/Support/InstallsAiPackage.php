<?php

namespace Everest\Tests\Extensions\ai;

use Illuminate\Console\Command;
use Illuminate\Foundation\Application;
use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Everest\Services\Extensions\ExtensionPackageIntegrityService;
use Illuminate\Contracts\Console\Kernel;
use Everest\Services\Extensions\ExtensionRuntimePlanService;
use Everest\Services\Authorization\AdminAuthorizer;
use Everest\Extensions\Packages\ai\Tools\RiskGate;
use Everest\Extensions\Packages\ai\Tools\ToolRegistry;
use Everest\Extensions\Packages\ai\Support\SchemaValidator;
use Everest\Services\Extensions\ExtensionRuntimeEntry;
use Everest\Services\Extensions\Manifest\ExtensionCapabilitySet;

/**
 * Stand the package up in the panel's runtime plan, from its real manifest.
 *
 * Every SDK facade that can do something consequential asks the plan first:
 * `InternalDispatch` and `DelegatedAccess` refuse unless the package holds the
 * matching entry in `capabilities.privileged`, `PackageStreams` refuses a
 * stream kind the manifest never declared, `PackageSecrets` refuses a secret
 * name it never declared, and `PackageSettings::save()` refuses outright when
 * the package is not in the plan. That is the right behaviour and none of it
 * can be switched off -- so a test process, which has no installed extension,
 * gets none of the package's own code past its first SDK call.
 *
 * What stands in for the install is the manifest itself. The descriptor the
 * test harness stages beside this file is the same `extension.json` the
 * packager signs, hydrated by core's own
 * {@see ExtensionRuntimePlanService::hydrateCapabilities()} into the same
 * {@see ExtensionCapabilitySet} an installed package would have. Only the
 * parts an install decides -- integrity, signature state, lifecycle -- are
 * assumed; everything the *manifest* decides is read from the manifest.
 *
 * Which is the point. A privilege, stream, secret or setting the package uses
 * and the manifest does not declare fails here, in the package's own test run,
 * with the same exception an operator would have seen on install.
 */
trait InstallsAiPackage
{
    /**
     * Register the package's artisan commands, the way the console kernel does.
     *
     * The kernel loads `app/Extensions/Packages/<id>/Console/Commands` for
     * every extension holding the `commands` capability -- once, while
     * booting, from the runtime plan. A test binds its plan long after that,
     * so nothing has loaded them and `$this->artisan('p:ext:ai:…')` finds no
     * such command. This does the same directory load against the same path.
     *
     * It also checks the manifest: every signature declared under
     * `capabilities.commands` must be one of the classes actually shipped, so
     * a command renamed on disk and not in the manifest -- which an operator
     * would meet as a scheduled task that silently never runs -- fails here.
     */
    protected function aiCommands(): void
    {
        $kernel = $this->app->make(Kernel::class);
        $directory = app_path('Extensions/Packages/ai/Console/Commands');
        $registered = [];

        foreach (glob($directory . '/*.php') ?: [] as $file) {
            $class = 'Everest\\Extensions\\Packages\\ai\\Console\\Commands\\' . basename($file, '.php');

            if (!is_subclass_of($class, Command::class)) {
                continue;
            }

            $command = $this->app->make($class);
            $kernel->registerCommand($command);
            $registered[] = $command->getName();
        }

        foreach ($this->aiCapabilitySet()->commands as $declared) {
            $signature = is_string($declared) ? $declared : ($declared->signature ?? (string) $declared);

            $this->assertContains(
                $signature,
                $registered,
                sprintf('The manifest declares the command [%s], which this package does not ship.', $signature)
            );
        }
    }

    /**
     * A tool registry that answers to this administrator double.
     *
     * The registry holds `AdminAuthorization::reader()` itself rather than
     * taking it, because the SDK facade has no public constructor -- so a test
     * substitutes the authorizer where the facade looks for it, in the
     * container, instead of handing it over as an argument.
     */
    protected function aiToolRegistry(RiskGate $riskGate, SchemaValidator $validator, AdminAuthorizer $authorizer): ToolRegistry
    {
        $this->app->instance(AdminAuthorizer::class, $authorizer);

        return new ToolRegistry($riskGate, $validator);
    }

    /**
     * Bind the plan before the kernel boots.
     *
     * `routes/api-client.php` and `routes/api-application.php` ask the plan
     * which packages contribute routes, and they do it while the route service
     * provider is booting -- before any test's `setUp()` runs. A plan bound in
     * `setUp()` is therefore too late for routing: the package's own endpoints
     * would simply not exist, and every request to one would answer 404 while
     * looking like an authorization problem.
     *
     * A trait method declared on the test class itself takes precedence over
     * the one the parent inherits from {@see \Everest\Tests\CreatesApplication},
     * which is why this can be a trait at all.
     */
    public function createApplication(): Application
    {
        $app = require dirname(__DIR__, 3) . '/bootstrap/app.php';

        $app->singleton(ExtensionRuntimePlanService::class, fn () => $this->aiPlanService());

        $app->make(ConsoleKernel::class)->bootstrap();

        return $app;
    }

    /**
     * Bind a runtime plan in which this package is installed and enabled.
     *
     * Routing is already handled by {@see createApplication()}; this is for a
     * test that rebinds the container mid-run, and for making the intent
     * legible in a `setUp()` that would otherwise not mention it.
     */
    protected function installAiPackage(): void
    {
        $this->app->singleton(ExtensionRuntimePlanService::class, fn () => $this->aiPlanService());
    }

    /** The panel's plan service, answering as though this package were installed. */
    protected function aiPlanService(): ExtensionRuntimePlanService
    {
        // Built directly rather than resolved, because resolving is what this
        // is standing in for.
        $real = new ExtensionRuntimePlanService(app(ExtensionPackageIntegrityService::class));
        $capabilities = $real->hydrateCapabilities($this->aiManifest()['capabilities'] ?? []);

        if (!$capabilities instanceof ExtensionCapabilitySet) {
            throw new \RuntimeException('The staged extension.json has no capability block core can hydrate.');
        }

        $entry = new ExtensionRuntimeEntry('ai', (string) ($this->aiManifest()['package']['version'] ?? '1.0.0'), $capabilities);

        return new class ($entry) extends ExtensionRuntimePlanService {
            public function __construct(private ExtensionRuntimeEntry $entry)
            {
            }

            public function plan(): array
            {
                return ['ai' => $this->entry];
            }

            public function entry(string $extensionId): ?ExtensionRuntimeEntry
            {
                return $extensionId === 'ai' ? $this->entry : null;
            }

            public function enabledIdsIncludingCoreExtensions(): array
            {
                return ['ai'];
            }
        };
    }

    /** The package's declared capabilities, as core would hydrate them. */
    protected function aiCapabilitySet(): ExtensionCapabilitySet
    {
        $entry = app(ExtensionRuntimePlanService::class)->entry('ai');

        if ($entry === null) {
            $this->fail('The AI package is not in the runtime plan; call installAiPackage() first.');
        }

        return $entry->capabilities;
    }

    /**
     * The descriptor the harness staged beside this trait.
     *
     * @return array<string, mixed>
     */
    protected function aiManifest(): array
    {
        $path = __DIR__ . '/extension.json';

        if (!is_file($path)) {
            $this->fail(
                'extension.json is not staged next to the AI test support traits. '
                . 'Run these tests through `m12labs_extension_tool.py tests extensions/ai`, '
                . 'which stages it.'
            );
        }

        return json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
    }
}
