<?php

namespace Everest\Tests\Unit\Extensions\ai\Http;

use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Everest\Extensions\Packages\ai\ProviderFactory;
use Everest\Extensions\Packages\ai\Agent\ToolBudget;
use Everest\Extensions\Packages\ai\Data\ProviderConfig;
use Everest\Extensions\Packages\ai\Privacy\AiRedactionPolicy;
use Everest\Extensions\Packages\ai\Providers\AbstractProvider;
use Everest\Extensions\Packages\ai\Exceptions\AIServiceException;
use Everest\Extensions\Packages\ai\Providers\OpenAiCompatibleProvider;
use Everest\Extensions\Packages\ai\Http\Controllers\IntelligenceController;
use Everest\Extensions\Packages\ai\Http\Requests\GetIntelligenceRequest;
use Everest\Extensions\Packages\ai\Http\Requests\ProbeToolCallingRequest;

class IntelligenceToolProbeTest extends AiPackageTestCase
{
    protected function tearDown(): void
    {
        \Mockery::close();

        parent::tearDown();
    }

    public function testGenericCompatibleProviderReturnsTheLiveProbeResult(): void
    {
        $config = new ProviderConfig(
            provider: ProviderConfig::PROVIDER_OPENAI_COMPATIBLE,
            endpoint: 'http://127.0.0.1:8080/v1',
            model: 'tool-model',
        );

        $provider = \Mockery::mock(OpenAiCompatibleProvider::class);
        $provider->shouldReceive('probeToolCalling')
            ->once()
            ->with('tool-model')
            ->andReturn([
                'status' => 'supported',
                'supports_tools' => true,
                'model' => 'tool-model',
                'checked_at' => '2026-08-23T12:00:00+00:00',
            ]);

        $factory = \Mockery::mock(ProviderFactory::class);
        $factory->shouldReceive('config')->once()->andReturn($config);
        $factory->shouldReceive('make')->once()->with(120)->andReturn($provider);

        $response = $this->controller($factory)->probeToolCalling(
            \Mockery::mock(ProbeToolCallingRequest::class),
        );

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('supported', $response->getData(true)['status']);
        $this->assertTrue($response->getData(true)['supports_tools']);
    }

    public function testOtherProvidersCannotRunTheGenericCompatibleProbe(): void
    {
        $factory = \Mockery::mock(ProviderFactory::class);
        $factory->shouldReceive('config')->once()->andReturn(new ProviderConfig(
            provider: ProviderConfig::PROVIDER_OPENAI,
            endpoint: 'https://api.openai.com/v1',
            apiKey: 'sk-test',
            model: 'gpt-test',
        ));
        $factory->shouldNotReceive('make');

        $response = $this->controller($factory)->probeToolCalling(
            \Mockery::mock(ProbeToolCallingRequest::class),
        );

        $this->assertSame(422, $response->getStatusCode());
        $this->assertSame('error', $response->getData(true)['status']);
    }

    public function testFailedProbeExplainsTheProviderProblemWithoutAnOpaqueReference(): void
    {
        $config = new ProviderConfig(
            provider: ProviderConfig::PROVIDER_OPENAI_COMPATIBLE,
            endpoint: 'http://127.0.0.1:8080/v1',
            model: 'tool-model',
        );

        $provider = \Mockery::mock(OpenAiCompatibleProvider::class);
        $provider->shouldReceive('probeToolCalling')
            ->once()
            ->andThrow(new AIServiceException(AbstractProvider::INCOMPATIBLE_REQUEST_MESSAGE));

        $factory = \Mockery::mock(ProviderFactory::class);
        $factory->shouldReceive('config')->twice()->andReturn($config);
        $factory->shouldReceive('make')->once()->with(120)->andReturn($provider);

        $response = $this->controller($factory)->probeToolCalling(
            \Mockery::mock(ProbeToolCallingRequest::class),
        );
        $message = (string) $response->getData(true)['message'];

        $this->assertSame(502, $response->getStatusCode());
        $this->assertStringContainsString('selected model and endpoint are compatible', $message);
        $this->assertStringNotContainsString('Administrator reference:', $message);
    }

    public function testConnectionFailureShowsTheSpecificProviderDiagnosis(): void
    {
        $config = new ProviderConfig(
            provider: ProviderConfig::PROVIDER_OPENAI,
            endpoint: 'https://api.openai.com/v1',
            apiKey: 'bad-key',
            model: 'gpt-test',
        );

        $provider = \Mockery::mock(OpenAiCompatibleProvider::class);
        $provider->shouldReceive('health')->once()->andReturnFalse();
        $provider->shouldReceive('lastFailure')->once()->andReturn(AbstractProvider::AUTHENTICATION_ERROR_MESSAGE);

        $factory = \Mockery::mock(ProviderFactory::class);
        $factory->shouldReceive('config')->times(3)->andReturn($config);
        $factory->shouldReceive('make')->once()->andReturn($provider);

        $request = \Mockery::mock(GetIntelligenceRequest::class);
        $request->shouldReceive('boolean')->with('fresh')->andReturnTrue();

        $response = $this->controller($factory)->testConnection($request);
        $message = (string) $response->getData(true)['message'];

        $this->assertSame(502, $response->getStatusCode());
        $this->assertStringContainsString('rejected the configured credentials', $message);
        $this->assertStringNotContainsString('Administrator reference:', $message);
    }

    private function controller(ProviderFactory $factory): IntelligenceController
    {
        // The controller holds `AdminAuthorization::reader()` itself, so the
        // double goes where that facade looks for it.
        $this->app->instance(
            \Everest\Services\Authorization\AdminAuthorizer::class,
            \Mockery::mock(\Everest\Services\Authorization\AdminAuthorizer::class),
        );

        return new IntelligenceController(
            $factory,
            \Mockery::mock(AiRedactionPolicy::class),
            \Mockery::mock(ToolBudget::class),
        );
    }
}
