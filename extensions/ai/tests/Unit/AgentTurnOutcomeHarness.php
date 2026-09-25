<?php

namespace Everest\Tests\Unit\Extensions\ai;

use Everest\Extensions\Packages\ai\Models\AiPendingAction;
use Everest\Extensions\Packages\ai\Tools\RiskGate;
use Everest\Extensions\Packages\ai\ProviderFactory;
use Everest\Extensions\Packages\ai\Agent\AgentRunner;
use Everest\Extensions\Packages\ai\Agent\AgentContext;
use Everest\Extensions\Packages\ai\Agent\TurnRecorder;
use Everest\Extensions\Packages\ai\Tools\ToolRegistry;
use Everest\Extensions\Packages\ai\Inference\TurnLease;
use Everest\Extensions\Packages\ai\Http\Concerns\HandlesAgentTurns;

/**
 * A stand-in for the two agent controllers, exposing the shared trait.
 *
 * Its own file rather than a companion at the bottom of one test, because a
 * class defined inside a test file only autoloads when that file happens to
 * have been loaded — so a second test using it passed with the suite and failed
 * on its own.
 */
class AgentTurnOutcomeHarness
{
    use HandlesAgentTurns;

    public function stream(
        AgentContext $context,
        ?TurnLease $lease = null,
    ): \Symfony\Component\HttpFoundation\StreamedResponse {
        return $this->streamTurn($context, lease: $lease);
    }

    public function cancel(
        $user,
        string $turnId,
        ?\Everest\Models\Server $server,
        string $scope,
    ): \Illuminate\Http\JsonResponse {
        return $this->cancelAgentTurn($user, $turnId, $server, $scope);
    }

    public function release($user, string $ticket): \Illuminate\Http\JsonResponse
    {
        return $this->releaseQueuePlace($user, $ticket);
    }

    public function queued(
        \Everest\Extensions\Packages\ai\Inference\Admission $admission,
    ): \Symfony\Component\HttpFoundation\StreamedResponse {
        return $this->queuedResponse($admission);
    }

    public function claim(AiPendingAction $pending): bool
    {
        return $this->claimPending($pending);
    }

    public function abandon(AiPendingAction $pending): void
    {
        $this->abandonClaim($pending);
    }

    public function expire(AiPendingAction $pending): bool
    {
        return $this->expireIfStale($pending);
    }

    public function sweep($scope): void
    {
        $this->sweepExpiredPending($scope);
    }

    public function assertDecision(AiPendingAction $pending, string $decision): void
    {
        $this->assertDecisionMatchesPending($pending, $decision);
    }

    public function assertAnswer(AiPendingAction $pending, string $answer): string
    {
        return $this->assertAnswerAcceptable($pending, $answer);
    }

    protected function agentRunner(): AgentRunner
    {
        return app(AgentRunner::class);
    }

    protected function toolRegistry(): ToolRegistry
    {
        return app(ToolRegistry::class);
    }

    protected function toolRiskGate(): RiskGate
    {
        return app(RiskGate::class);
    }

    protected function turnRecorder(): TurnRecorder
    {
        return app(TurnRecorder::class);
    }

    protected function providerFactory(): ProviderFactory
    {
        return app(ProviderFactory::class);
    }
}
