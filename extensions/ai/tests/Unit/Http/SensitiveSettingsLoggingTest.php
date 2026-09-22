<?php

namespace Everest\Tests\Unit\Extensions\ai\Http;

use Everest\Models\User;
use Everest\Facades\Activity;
use Illuminate\Http\Response;
use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Everest\Services\Authorization\AdminAuthorizer;
use Everest\Extensions\Packages\ai\ProviderFactory;
use Everest\Extensions\Packages\ai\Agent\ToolBudget;
use Everest\Extensions\Packages\ai\Privacy\AiRedactionPolicy;
use Everest\Extensions\Packages\ai\Support\SensitiveKeyMask;
use Everest\Extensions\Packages\ai\Http\Controllers\IntelligenceController;
use Everest\Extensions\Packages\ai\Http\Requests\UpdateIntelligenceSettingsRequest;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * What the settings endpoint writes into the activity log, and who may call it.
 *
 * Both of these were in the panel's own
 * `tests/Unit/Http/Controllers/Api/Application/SensitiveSettingsLoggingTest`
 * alongside the mods and plugins settings endpoints, because the controller
 * was core's. It is this package's now, and so are these two cases; the other
 * two stayed.
 */
class SensitiveSettingsLoggingTest extends AiPackageTestCase
{
    protected function tearDown(): void
    {
        \Mockery::close();

        parent::tearDown();
    }

    /**
     * A credential reaches the activity log masked or not at all.
     *
     * An admin activity row is readable by anybody who can read the audit log,
     * which is a wider audience than the people allowed to set a provider key.
     */
    public function testIntelligenceSettingsActivityRedactsSensitiveValues(): void
    {
        $this->authorizer(interactiveOwner: true);

        $controller = new IntelligenceController(
            \Mockery::mock(ProviderFactory::class),
            app(AiRedactionPolicy::class),
            app(ToolBudget::class),
        );

        $request = \Mockery::mock(UpdateIntelligenceSettingsRequest::class);
        $request->shouldReceive('changesProviderConnection')->once()->andReturn(false);
        $request->shouldReceive('normalize')->once()->andReturn([]);
        $request->shouldReceive('all')->once()->andReturn([
            'key' => 'super-secret-ai-key',
            'mode' => 'openai',
        ]);

        // `PanelActivity` is a thin wrapper over this facade and stamps the
        // package id onto the event name, which is the other half of what is
        // being asserted: an extension cannot write an event that reads as
        // core's.
        Activity::shouldReceive('event')->once()->with('ext:ai:update')->andReturnSelf();
        Activity::shouldReceive('property')
            ->once()
            ->with('settings', \Mockery::on(function (array $payload): bool {
                return $payload['key'] === SensitiveKeyMask::REDACTED
                    && $payload['mode'] === 'openai';
            }))
            ->andReturnSelf();
        Activity::shouldReceive('description')->once()->andReturnSelf();
        Activity::shouldReceive('log')->once()->andReturnNull();

        $response = $controller->update($request);

        $this->assertSame(Response::HTTP_NO_CONTENT, $response->getStatusCode());
    }

    /**
     * Changing the provider connection is not delegable.
     *
     * The endpoint and the credential decide which host the panel becomes an
     * HTTP client for, so that one change is reserved for an Owner who is
     * present -- never an Application API key belonging to that account, which
     * is long-lived and hard to notice being used.
     */
    public function testDelegatedAdminCannotChangeProviderConnection(): void
    {
        $this->authorizer(interactiveOwner: false);

        $controller = new IntelligenceController(
            \Mockery::mock(ProviderFactory::class),
            app(AiRedactionPolicy::class),
            app(ToolBudget::class),
        );

        $request = \Mockery::mock(UpdateIntelligenceSettingsRequest::class);
        $request->shouldReceive('changesProviderConnection')->once()->andReturn(true);
        $request->shouldReceive('user')->once()->andReturn(\Mockery::mock(User::class));
        $request->shouldNotReceive('normalize');

        $this->expectException(AccessDeniedHttpException::class);

        $controller->update($request);
    }

    /**
     * The controller holds `AdminAuthorization::reader()` itself, so the
     * double goes where that facade looks for it.
     */
    private function authorizer(bool $interactiveOwner): void
    {
        $mock = \Mockery::mock(AdminAuthorizer::class);
        $mock->shouldReceive('isInteractiveOwner')->andReturn($interactiveOwner);
        $mock->shouldReceive('isOwner')->andReturn($interactiveOwner);
        $mock->shouldReceive('hasCapability')->andReturn(true);

        $this->app->instance(AdminAuthorizer::class, $mock);
    }

}
