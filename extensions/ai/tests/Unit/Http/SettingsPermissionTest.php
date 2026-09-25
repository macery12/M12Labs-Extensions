<?php

namespace Everest\Tests\Unit\Extensions\ai\Http;

use Everest\Models\User;
use Everest\Facades\Activity;
use Everest\Extensions\Sdk\DisplayException;
use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Everest\Extensions\Packages\ai\AiConfiguration;
use Everest\Extensions\Sdk\Services\PackageSecrets;
use Everest\Services\Authorization\AdminAuthorizer;
use Everest\Extensions\Sdk\Services\PackageSettings;

/**
 * Configuring the assistant takes the assistant's own permission.
 *
 * The settings pages are gated by `ext.ai.admin.update`, and every write they
 * make names it. So an operator can let someone manage the assistant — its
 * provider, its limits, its API key — without also handing them core
 * `extensions.update`, which installs and removes every extension on the panel.
 */
class SettingsPermissionTest extends AiPackageTestCase
{
    private User $admin;

    /** @var array<int, string> what the administrator under test holds */
    private array $holds = [];

    public function setUp(): void
    {
        parent::setUp();

        $this->admin = $this->aiOwner();

        $authorizer = \Mockery::mock(AdminAuthorizer::class);
        $authorizer->shouldReceive('hasCapability')->andReturnUsing(
            fn (User $user, string $capability): bool => in_array($capability, $this->holds, true),
        );
        $this->app->instance(AdminAuthorizer::class, $authorizer);

        $activity = \Mockery::mock(\Everest\Services\Activity\ActivityLogService::class);
        $activity->shouldReceive('event', 'actor', 'property', 'description', 'subject')->andReturnSelf();
        $activity->shouldReceive('log')->andReturnNull();
        Activity::swap($activity);

        $this->aiEnabled();
        $this->aiConfig(['provider' => 'ollama']);
    }

    protected function tearDown(): void
    {
        \Mockery::close();

        parent::tearDown();
    }

    public function testTheSettingsPagesDeclareThePermissionTheirWritesName(): void
    {
        $identifiers = array_map(
            fn ($permission) => $permission->identifier('ai'),
            $this->aiCapabilitySet()->adminPermissions,
        );

        $this->assertContains(AiConfiguration::SETTINGS_PERMISSION, $identifiers);
    }

    public function testTheAssistantsOwnPermissionIsEnoughToSaveSettingsAndAKey(): void
    {
        $this->holds = [AiConfiguration::SETTINGS_PERMISSION];

        AiConfiguration::setMany(['provider' => 'anthropic', 'key' => 'sk-ant-test-123'], $this->admin);
        AiConfiguration::flush();

        $this->assertSame('anthropic', PackageSettings::for('ai')->string('provider'));
        $this->assertSame('sk-ant-test-123', PackageSecrets::for('ai')->get('api_key'));
    }

    public function testCoreExtensionsUpdateStillSuffices(): void
    {
        $this->holds = ['extensions.update'];

        AiConfiguration::setMany(['provider' => 'anthropic', 'key' => 'sk-ant-test-456'], $this->admin);

        $this->assertSame('sk-ant-test-456', PackageSecrets::for('ai')->get('api_key'));
    }

    public function testAnAdministratorWithNeitherCannotSaveAnything(): void
    {
        $this->holds = ['servers.read'];

        try {
            AiConfiguration::setMany(['provider' => 'anthropic'], $this->admin);
            $this->fail('Expected the settings write to be refused.');
        } catch (DisplayException) {
            $this->addToAssertionCount(1);
        }

        try {
            AiConfiguration::setMany(['key' => 'sk-ant-test-789'], $this->admin);
            $this->fail('Expected the credential write to be refused.');
        } catch (DisplayException) {
            $this->addToAssertionCount(1);
        }

        AiConfiguration::flush();
        $this->assertSame('ollama', PackageSettings::for('ai')->string('provider'));
        $this->assertNull(PackageSecrets::for('ai')->get('api_key'));
    }
}
