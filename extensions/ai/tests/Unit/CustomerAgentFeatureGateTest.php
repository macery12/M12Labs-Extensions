<?php

namespace Everest\Tests\Unit\Extensions\ai;

use Everest\Models\User;
use Everest\Models\Server;
use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Illuminate\Http\Request;
use Everest\Models\AdminRole;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Everest\Extensions\Packages\ai\Http\Controllers\AgentController;
use Everest\Extensions\Packages\ai\Http\Requests\Client\StartAgentTurnRequest;
use Everest\Extensions\Packages\ai\Http\Requests\Client\AgentTurnStateRequest;
use Everest\Extensions\Packages\ai\Http\Requests\Client\DecideAgentTurnRequest;

class CustomerAgentFeatureGateTest extends AiPackageTestCase
{
    /**
     * Account privilege must have no effect on the customer agent. Its master
     * module and dedicated switch are the whole admission decision.
     */
    public function testEveryFlagCombinationTreatsOrdinaryUsersAndOwnersEqually(): void
    {
        $method = new \ReflectionMethod(AgentController::class, 'assertAgentEnabled');
        $controller = (new \ReflectionClass(AgentController::class))->newInstanceWithoutConstructor();

        try {
            $this->forgetFlags();
            foreach ([false, true] as $moduleEnabled) {
                foreach ([false, true] as $agentEnabled) {
                    $this->flags($moduleEnabled, $agentEnabled);

                    foreach ([false, true] as $owner) {
                        $request = Request::create('/api/client/servers/server/ai/agent', 'POST');
                        $request->setUserResolver(fn () => $this->user($owner));
                        $allowed = $moduleEnabled && $agentEnabled;

                        try {
                            $method->invoke($controller, $request);
                            $this->assertTrue($allowed, $this->caseName($moduleEnabled, $agentEnabled, $owner));
                        } catch (HttpException $e) {
                            $this->assertFalse($allowed, $this->caseName($moduleEnabled, $agentEnabled, $owner));
                            $this->assertSame(403, $e->getStatusCode());
                        }
                    }
                }
            }
        } finally {
            $this->forgetFlags();
        }
    }

    public function testDisabledAgentRefusesEveryDirectEndpointForOrdinaryUsersAndOwners(): void
    {
        $controller = (new \ReflectionClass(AgentController::class))->newInstanceWithoutConstructor();
        $server = new Server();
        $server->uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        $this->forgetFlags();
        $this->flags(true, false);

        try {
            foreach ([false, true] as $owner) {
                // Each endpoint takes its own FormRequest now, so the gate is
                // reached through the type the router would really hand it.
                $requests = [
                    'start' => StartAgentTurnRequest::class,
                    'activeTurn' => AgentTurnStateRequest::class,
                    'turnStatus' => AgentTurnStateRequest::class,
                    'decide' => DecideAgentTurnRequest::class,
                ];

                foreach ($requests as $method => $class) {
                    $request = $class::createFrom(Request::create('/api/client/servers/server/ai/agent', 'POST'));
                    $request->setUserResolver(fn () => $this->user($owner));

                    try {
                        $method === 'turnStatus'
                            ? $controller->{$method}($request, $server, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
                            : $controller->{$method}($request, $server);
                        $this->fail(sprintf('%s should be disabled for owner=%s.', $method, $owner ? 'yes' : 'no'));
                    } catch (HttpException $e) {
                        $this->assertSame(403, $e->getStatusCode());
                    }
                }
            }
        } finally {
            $this->forgetFlags();
        }
    }

    private function flags(bool $module, bool $agent): void
    {
        $this->aiConfig(['enabled' => $module]);
        $this->aiConfig(['agent.enabled' => $agent]);
    }

    private function forgetFlags(): void
    {
        $this->aiForget('enabled');
        $this->aiForget('agent.enabled');
    }

    private function user(bool $owner): User
    {
        $profile = null;
        if ($owner) {
            $profile = new AdminRole();
            $profile->forceFill(['id' => 1, 'is_owner' => true]);
        }

        $user = new User();
        $user->forceFill(['id' => $owner ? 2 : 1, 'admin_role_id' => $profile?->id]);
        $user->setRelation('adminRole', $profile);

        return $user;
    }

    private function caseName(bool $module, bool $agent, bool $owner): string
    {
        return sprintf(
            'module=%s agent=%s owner=%s',
            $module ? 'on' : 'off',
            $agent ? 'on' : 'off',
            $owner ? 'yes' : 'no',
        );
    }
}
