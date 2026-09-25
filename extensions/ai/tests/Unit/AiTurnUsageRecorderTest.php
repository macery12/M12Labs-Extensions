<?php

namespace Everest\Tests\Unit\Extensions\ai;

use Everest\Models\Egg;
use Everest\Models\Nest;
use Everest\Models\User;
use Everest\Models\Server;
use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Everest\Extensions\Packages\ai\Models\AiUsageLog;
use Everest\Extensions\Packages\ai\Models\AiConversation;
use Everest\Extensions\Packages\ai\Models\AiPendingAction;
use Everest\Extensions\Packages\ai\Tools\RiskGate;
use Everest\Extensions\Packages\ai\ProviderFactory;
use Everest\Extensions\Packages\ai\Agent\AgentRunner;
use Everest\Extensions\Packages\ai\Agent\AgentContext;
use Everest\Extensions\Packages\ai\Agent\TurnRecorder;
use Everest\Extensions\Packages\ai\Tools\ToolRegistry;
use Everest\Extensions\Packages\ai\Tools\ToolDefinition;
use Everest\Extensions\Packages\ai\Support\AiBudgetService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Everest\Extensions\Packages\ai\Support\AiTurnUsageRecorder;
use Everest\Extensions\Packages\ai\Tools\Definitions\SharedTools;
use Everest\Tests\Traits\Integration\CreatesTestModels;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Everest\Extensions\Packages\ai\Http\Concerns\HandlesAgentTurns;

class AiTurnUsageRecorderTest extends AiPackageTestCase
{
    use RefreshDatabase;
    use CreatesTestModels;

    public function testANeverResumedLegRemainsExplicitlySuspended(): void
    {
        $user = User::factory()->create();
        $turnId = '11111111-2222-4333-8444-555555555555';

        app(AiTurnUsageRecorder::class)->record($turnId, [
            'user_id' => $user->id,
            'model' => 'test',
            'source' => 'agent',
            'total_tokens' => 40,
            'status' => 'suspended',
        ]);

        $this->assertDatabaseHas('ext_ai_usage_logs', [
            'turn_id' => $turnId,
            'total_tokens' => 40,
            'status' => 'suspended',
        ]);
    }

    public function testMultipleSuspendResumeLegsRemainOneCumulativeLogicalTurn(): void
    {
        $user = User::factory()->create();
        $turnId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
        $recorder = app(AiTurnUsageRecorder::class);
        $context = new AgentContext($user, null, $turnId);

        $context->toolCalls = 1;
        $context->addUsage(['prompt_tokens' => 80, 'completion_tokens' => 20, 'total_tokens' => 100]);
        $recorder->record($turnId, $this->attributes($user, $context, 'suspended'));

        $suspended = AiUsageLog::query()->where('turn_id', $turnId)->firstOrFail();
        $this->assertSame('suspended', $suspended->status);

        $context = AgentContext::fromState($user, null, $turnId, null, $context->toState());
        $context->toolCalls += 2;
        $context->addUsage(['prompt_tokens' => 35, 'completion_tokens' => 15, 'total_tokens' => 50]);
        $recorder->record($turnId, $this->attributes($user, $context));

        $this->assertSame(1, AiUsageLog::query()->where('turn_id', $turnId)->count());
        $row = AiUsageLog::query()->where('turn_id', $turnId)->firstOrFail();
        $this->assertSame(150, $row->total_tokens);
        $this->assertSame(115, $row->prompt_tokens);
        $this->assertSame(35, $row->completion_tokens);
        $this->assertSame(3, $row->tool_calls_count);
        $this->assertSame('success', $row->status);
        $this->assertSame(150, app(AiBudgetService::class)->usedThisMonth($user));
    }

    public function testExpiredRunningTurnReconcilesToAuthoritativeFailure(): void
    {
        $user = User::factory()->create();
        $turnId = '99999999-bbbb-4ccc-8ddd-eeeeeeeeeeee';
        app(AiTurnUsageRecorder::class)->record($turnId, [
            'user_id' => $user->id,
            'model' => 'test',
            'source' => 'admin-agent',
            'prompt_tokens' => 0,
            'completion_tokens' => 0,
            'total_tokens' => 0,
            'status' => 'running',
            'heartbeat_at' => now()->subMinutes(20),
            'deadline_at' => now()->subMinute(),
        ]);

        $data = (new TurnStatusHarness())->status($user, $turnId)->getData(true)['data'];

        $this->assertTrue($data['terminal']);
        $this->assertSame('error', $data['status']);
        $this->assertDatabaseHas('ext_ai_usage_logs', [
            'turn_id' => $turnId,
            'status' => 'error',
        ]);
    }

    public function testTurnStatusIsScopedToTheOwningUserAndServer(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $nest = Nest::factory()->create();
        $egg = Egg::factory()->create([
            'nest_id' => $nest->id,
            'author' => 'test@example.com',
            'docker_images' => ['example/image:latest'],
            'config_stop' => 'stop',
            'config_startup' => '{}',
            'config_files' => '{}',
        ]);
        $server = $this->createServerModel([
            'owner_id' => $user->id,
            'nest_id' => $nest->id,
            'egg_id' => $egg->id,
        ]);
        $otherServer = $this->createServerModel([
            'owner_id' => $user->id,
            'nest_id' => $nest->id,
            'egg_id' => $egg->id,
        ]);
        $turnId = '88888888-bbbb-4ccc-8ddd-eeeeeeeeeeee';

        app(AiTurnUsageRecorder::class)->record($turnId, [
            'user_id' => $user->id,
            'server_uuid' => $server->uuid,
            'model' => 'test',
            'source' => 'agent',
            'total_tokens' => 1,
            'status' => 'success',
        ]);

        $this->assertSame('success', (new TurnStatusHarness())->serverStatus($user, $server, $turnId)
            ->getData(true)['data']['status']);

        foreach ([[$other, $server], [$user, $otherServer]] as [$actor, $target]) {
            try {
                (new TurnStatusHarness())->serverStatus($actor, $target, $turnId);
                $this->fail('Cross-subject turn status should not resolve.');
            } catch (ModelNotFoundException) {
                $this->assertTrue(true);
            }
        }
    }

    public function testSuspendedStatusRestoresItsActionableQuestionPayload(): void
    {
        $user = User::factory()->create();
        $conversation = AiConversation::create([
            'user_id' => $user->id,
            'server_uuid' => null,
            'scope' => AiConversation::SCOPE_ADMIN,
            'title' => 'Question',
            'expires_at' => now()->addDay(),
        ]);
        $turnId = '77777777-bbbb-4ccc-8ddd-eeeeeeeeeeee';

        app(AiTurnUsageRecorder::class)->record($turnId, [
            'user_id' => $user->id,
            'conversation_id' => $conversation->id,
            'model' => 'test',
            'source' => 'admin-agent',
            'total_tokens' => 5,
            'status' => 'suspended',
        ]);
        AiPendingAction::create([
            'turn_id' => $turnId,
            'conversation_id' => $conversation->id,
            'user_id' => $user->id,
            'server_uuid' => null,
            'scope' => ToolDefinition::SCOPE_ADMIN,
            'tool_name' => SharedTools::ASK_USER,
            'tool_call_id' => 'question-1',
            'risk' => ToolDefinition::RISK_SAFE,
            'arguments' => [
                'question' => 'Which region?',
                'options' => [['label' => 'EU'], ['label' => 'US']],
                'allow_other' => true,
            ],
            'state' => [],
            'step' => 1,
            'status' => AiPendingAction::STATUS_PENDING,
            'expires_at' => now()->addMinutes(30),
        ]);

        $data = (new TurnStatusHarness())->status($user, $turnId)->getData(true)['data'];

        $this->assertSame('suspended', $data['status']);
        $this->assertSame('question', $data['pending']['kind']);
        $this->assertSame('Which region?', $data['pending']['question']);
        $this->assertSame(['EU', 'US'], array_column($data['pending']['options'], 'label'));
    }

    /**
     * The turn id and the idle allowance used to be response headers on a
     * hand-rolled SSE response. The stream is the platform's now, and its
     * headers are the platform's, so the two values the client needs are the
     * first thing written into the stream instead -- which also means a
     * reconnected relay announces them again, where a header could not.
     */
    public function testTheStreamAnnouncesItsTurnIdAndNineHundredSecondIdleAllowance(): void
    {
        // The panel expressed this as a config default of 900 with no stored
        // override; the package has one store, so it is simply the value.
        $this->aiConfig(['agent.max_wall_seconds' => 900]);

        $context = new AgentContext(
            User::factory()->make(['id' => 1]),
            null,
            '66666666-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        );

        $response = (new TurnStatusHarness())->stream($context);

        // Only the announcement is under test, and it is written before any
        // work begins -- which is the property: a client learns its idle
        // allowance immediately, not once the turn has produced something.
        // Executing the turn itself needs a populated database, so whatever it
        // does after that first frame is not this test's business.
        //
        // An output *handler* rather than a plain buffer, because the writer
        // flushes every frame as it goes: `ob_flush()` would hand the content
        // straight past a plain buffer and `ob_get_clean()` would find it
        // empty. The handler sees each chunk and swallows it.
        $body = '';
        ob_start(function (string $chunk) use (&$body): string {
            $body .= $chunk;

            return '';
        });

        try {
            $response->sendContent();
        } catch (\Throwable) {
            // deliberately ignored; see above
        } finally {
            ob_end_clean();
        }

        $announcement = $this->firstStreamEvent($body);

        $this->assertSame('stream', $announcement['type']);
        $this->assertSame($context->turnId, $announcement['turn_id']);
        $this->assertSame(930, $announcement['idle_seconds']);
    }

    /**
     * The first `data:` frame of an SSE body, decoded.
     *
     * @return array<string, mixed>
     */
    private function firstStreamEvent(string $body): array
    {
        foreach (explode("\n", $body) as $line) {
            if (!str_starts_with($line, 'data:')) {
                continue;
            }

            $payload = trim(substr($line, 5));

            if ($payload === '' || $payload === '[DONE]') {
                continue;
            }

            return json_decode($payload, true, flags: JSON_THROW_ON_ERROR);
        }

        $this->fail('The stream wrote no data frame: ' . var_export($body, true));
    }

    /** @return array<string, mixed> */
    private function attributes(User $user, AgentContext $context, string $status = 'success'): array
    {
        return [
            'user_id' => $user->id,
            'model' => 'test',
            'source' => 'agent',
            'prompt_tokens' => $context->usage['prompt_tokens'],
            'completion_tokens' => $context->usage['completion_tokens'],
            'total_tokens' => $context->usage['total_tokens'],
            'tool_calls_count' => $context->toolCalls,
            'status' => $status,
        ];
    }
}

class TurnStatusHarness
{
    use HandlesAgentTurns;

    public function status(User $user, string $turnId): \Illuminate\Http\JsonResponse
    {
        return $this->agentTurnStatus($user, $turnId, null, ToolDefinition::SCOPE_ADMIN);
    }

    public function serverStatus(User $user, Server $server, string $turnId): \Illuminate\Http\JsonResponse
    {
        return $this->agentTurnStatus($user, $turnId, $server, ToolDefinition::SCOPE_SERVER);
    }

    public function stream(AgentContext $context): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        return $this->streamTurn($context);
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
