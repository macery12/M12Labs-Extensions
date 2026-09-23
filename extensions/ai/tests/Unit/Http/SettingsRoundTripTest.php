<?php

namespace Everest\Tests\Unit\Extensions\ai\Http;

use Everest\Models\User;
use Everest\Facades\Activity;
use Illuminate\Support\Facades\Validator;
use Everest\Extensions\Packages\ai\AiConfiguration;
use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Everest\Services\Authorization\AdminAuthorizer;
use Everest\Extensions\Sdk\Services\PackageSecrets;
use Everest\Extensions\Sdk\Services\PackageSettings;
use Everest\Extensions\Packages\ai\Http\Requests\GetIntelligenceRequest;
use Everest\Extensions\Packages\ai\Http\Controllers\IntelligenceController;
use Everest\Extensions\Packages\ai\Http\Requests\UpdateIntelligenceSettingsRequest;

/**
 * Every control on the AI settings pages saves, and reads back as saved.
 *
 * Moving the module into a package split its configuration across three
 * stores, and the write side was only ever exercised against fixtures that
 * wrote the rows directly. So nothing noticed that the page could no longer
 * save an API key at all -- nor that a provider switch, which blanks the key,
 * failed the whole save with it. This drives the real request, controller and
 * stores, the way the page does.
 */
class SettingsRoundTripTest extends AiPackageTestCase
{
    private User $owner;

    public function setUp(): void
    {
        parent::setUp();

        $this->owner = $this->aiOwner();

        $authorizer = \Mockery::mock(AdminAuthorizer::class);
        $authorizer->shouldReceive('isInteractiveOwner')->andReturn(true);
        $authorizer->shouldReceive('isOwner')->andReturn(true);
        $authorizer->shouldReceive('hasCapability')->andReturn(true);
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

    /** @param array<string, mixed> $payload */
    private function save(array $payload): void
    {
        $request = UpdateIntelligenceSettingsRequest::create('/', 'PUT', $payload);
        $request->setContainer($this->app);
        $request->setUserResolver(fn () => $this->owner);

        Validator::make($request->all(), $request->rules())->validate();

        $this->app->make(IntelligenceController::class)->update($request);
        AiConfiguration::flush();
    }

    /** @return array<string, mixed> */
    private function read(): array
    {
        $request = GetIntelligenceRequest::create('/', 'GET');
        $request->setContainer($this->app);

        return $this->app->make(IntelligenceController::class)->index($request)->getData(true);
    }

    public function testEveryControlOnTheSettingsPagesSavesAndReadsBack(): void
    {
        $this->save([
            'provider' => 'anthropic',
            'key' => 'sk-ant-test-123',
            'endpoint' => 'https://api.anthropic.com/v1',
            'model' => 'claude-sonnet-5',
            'max_tokens' => 2500,
            'temperature' => 0.5,
            'keep_alive' => '30m',
            'warm' => true,
            'context_tokens' => 8192,
            'system_prompt' => 'You are a careful assistant inside the panel.',
            'agent' => [
                'enabled' => true,
                'admin_enabled' => true,
                'reasoning' => false,
                'max_steps' => 20,
                'max_wall_seconds' => 300,
                'max_tool_seconds' => 60,
                'tool_result_bytes' => 16384,
                'max_repairs' => 3,
                'max_tools' => 16,
                'max_batch_calls' => 40,
                'allow_destructive_batches' => true,
            ],
            'concurrency' => ['slots' => 4, 'queue_depth' => 10, 'max_wait_seconds' => 60, 'per_user' => 2],
            'budget' => ['enforce' => true, 'monthly_tokens' => 5000000],
            'privacy' => ['enabled' => false, 'categories' => ['email', 'ip']],
        ]);

        $read = $this->read();

        $this->assertSame('anthropic', $read['provider']);
        $this->assertTrue($read['key']);
        $this->assertSame('sk-ant-test-123', PackageSecrets::for('ai')->get('api_key'));
        $this->assertSame('https://api.anthropic.com/v1', $read['endpoint']);
        $this->assertSame('claude-sonnet-5', $read['model']);
        $this->assertSame(2500, $read['max_tokens']);
        $this->assertEquals(0.5, $read['temperature']);
        $this->assertSame('30m', $read['keep_alive']);
        $this->assertTrue($read['warm']);
        $this->assertSame(8192, $read['context_tokens']);
        $this->assertSame('You are a careful assistant inside the panel.', $read['system_prompt']);

        $this->assertTrue($read['agent']['enabled']);
        $this->assertTrue($read['agent']['admin_enabled']);
        $this->assertFalse($read['agent']['reasoning']);
        $this->assertSame(20, $read['agent']['max_steps']);
        $this->assertSame(300, $read['agent']['max_wall_seconds']);
        $this->assertSame(60, $read['agent']['max_tool_seconds']);
        $this->assertSame(16384, $read['agent']['tool_result_bytes']);
        $this->assertSame(3, $read['agent']['max_repairs']);
        $this->assertSame(16, $read['agent']['max_tools']);
        $this->assertSame(40, $read['agent']['max_batch_calls']);
        $this->assertTrue($read['agent']['allow_destructive_batches']);

        $this->assertSame(4, $read['concurrency']['slots']);
        $this->assertSame(10, $read['concurrency']['queue_depth']);
        $this->assertSame(60, $read['concurrency']['max_wait_seconds']);
        $this->assertSame(2, $read['concurrency']['per_user']);

        $this->assertTrue($read['budget']['enforce']);
        $this->assertSame(5000000, $read['budget']['monthly_tokens']);

        $this->assertFalse($read['privacy']['enabled']);
        $this->assertEqualsCanonicalizing(['email', 'ip'], $read['privacy']['categories']);

        // And the drawer sees the same values, because it is the same row.
        $this->assertSame('claude-sonnet-5', PackageSettings::for('ai')->string('model'));
    }

    /** "Auto" and "no cap" are null on the page, and must stay null. */
    public function testAutomaticValuesSaveAsAutomatic(): void
    {
        $this->save(['context_tokens' => null, 'agent' => ['max_tools' => null], 'concurrency' => ['slots' => null]]);

        $read = $this->read();

        $this->assertNull($read['context_tokens']);
        $this->assertNull($read['agent']['max_tools']);
    }

    public function testRemovingTheKeyClearsIt(): void
    {
        $this->save(['key' => 'sk-live-abc']);
        $this->assertTrue($this->read()['key']);

        $this->save(['key' => '']);

        $this->assertFalse($this->read()['key']);
        $this->assertFalse(PackageSecrets::for('ai')->configured('api_key'));
    }

    /**
     * The provider switch blanks the shared key; that used to fail the whole
     * save, so no provider could be changed from this page at all.
     */
    public function testSwitchingProviderSavesAndClearsTheOldKey(): void
    {
        $this->save(['key' => 'sk-ollama-proxy']);

        $this->save(['provider' => 'openai']);

        $read = $this->read();
        $this->assertSame('openai', $read['provider']);
        $this->assertFalse($read['key']);
    }

    public function testSwitchingProviderWithANewKeyKeepsTheNewKey(): void
    {
        $this->save(['provider' => 'openai', 'key' => 'sk-openai-new']);

        $this->assertSame('sk-openai-new', PackageSecrets::for('ai')->get('api_key'));
    }

    /** A rejected page saves nothing, not the fields before the bad one. */
    public function testAnOutOfRangeValueSavesNothing(): void
    {
        try {
            AiConfiguration::setMany(['model' => 'half-saved', 'agent.max_steps' => 9999], $this->owner);
            $this->fail('An out-of-range value was accepted.');
        } catch (\Illuminate\Validation\ValidationException) {
        }

        AiConfiguration::flush();
        $this->assertNotSame('half-saved', AiConfiguration::string('model'));
    }

    public function testThePackageCannotWriteACredentialWithNoAdministrator(): void
    {
        $this->expectException(\Everest\Extensions\Sdk\DisplayException::class);

        AiConfiguration::set('key', 'sk-from-nowhere');
    }
}
