<?php

namespace Everest\Tests\Unit\Extensions\ai;

use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Everest\Extensions\Packages\ai\Models\AiPendingAction;
use Illuminate\Support\Facades\Schema;
use Everest\Extensions\Packages\ai\Tools\RiskGate;
use Everest\Extensions\Packages\ai\ProviderFactory;
use Everest\Extensions\Packages\ai\Agent\AgentRunner;
use Everest\Extensions\Packages\ai\Agent\TurnRecorder;
use Everest\Extensions\Packages\ai\Tools\ToolRegistry;
use Everest\Extensions\Packages\ai\Http\Concerns\HandlesAgentTurns;
use Illuminate\Foundation\Testing\RefreshDatabase;

class PendingActionClaimTest extends AiPackageTestCase
{
    // The package's tables carry real foreign keys to `users`, `servers` and
    // each other, so the rows this test claims against need a panel to hang
    // off. The fixture table it used to build had no keys at all, which is
    // why it did not.
    use RefreshDatabase;

    private PendingClaimHarness $harness;

    private \Everest\Models\User $owner;

    public function setUp(): void
    {
        parent::setUp();

        // The real table, created by the package's own migration in the base
        // class -- which means its foreign key to `users` is real too, so the
        // fixture owes it a users table. A hand-rolled copy without the key
        // used to stand in here and quietly stopped testing the constraint.
        $this->owner = $this->aiOwner();

        AiPendingAction::query()->delete();
        $this->harness = new PendingClaimHarness();
    }

    public function testExactlyOneOfTwoClaimantsCanReserveTheMutation(): void
    {
        $row = $this->pending();
        $first = AiPendingAction::findOrFail($row->id);
        $second = AiPendingAction::findOrFail($row->id);

        $this->assertTrue($this->harness->claim($first));
        $this->assertFalse($this->harness->claim($second));

        $row->refresh();
        $this->assertSame(AiPendingAction::STATUS_EXECUTING, $row->status);
        $this->assertNotNull($row->execution_key);
        $this->assertSame($row->execution_key, $second->execution_key);
    }

    public function testDuplicateBatchApprovalCannotAcquireASecondExecutionKey(): void
    {
        $row = $this->pending(['tool_name' => 'batch']);

        $this->assertTrue($this->harness->claim(AiPendingAction::findOrFail($row->id)));
        $key = $row->fresh()->execution_key;
        $this->assertFalse($this->harness->claim(AiPendingAction::findOrFail($row->id)));
        $this->assertSame($key, $row->fresh()->execution_key);
    }

    public function testClaimedWorkerFailureBecomesTerminalAndIsNeverReclaimed(): void
    {
        $row = $this->pending();
        $this->assertTrue($this->harness->claim($row));

        $row->update(['claimed_at' => now()->subMinutes(11)]);
        $this->harness->recover($row->fresh());

        $row->refresh();
        $this->assertSame(AiPendingAction::STATUS_FAILED, $row->status);
        $this->assertNotNull($row->resolved_at);
        $this->assertFalse($this->harness->claim($row));
    }

    public function testExecutionKeysAreStablePerCallAndDistinctAcrossBatchChildren(): void
    {
        $context = new \Everest\Extensions\Packages\ai\Agent\AgentContext(
            new \Everest\Models\User(),
            null,
            'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        );
        $context->executionKey = '11111111-2222-4333-8444-555555555555';

        $this->assertSame($context->idempotencyKeyFor('child-1'), $context->idempotencyKeyFor('child-1'));
        $this->assertNotSame($context->idempotencyKeyFor('child-1'), $context->idempotencyKeyFor('child-2'));
    }

    /** A conversation for the pending row to belong to. */
    private function conversation(): \Everest\Extensions\Packages\ai\Models\AiConversation
    {
        return \Everest\Extensions\Packages\ai\Models\AiConversation::query()->create([
            'user_id' => $this->owner->id,
            'server_uuid' => null,
            'scope' => 'admin',
            'title' => 'Claim test',
        ]);
    }

    private function pending(array $overrides = []): AiPendingAction
    {
        return AiPendingAction::create(array_merge([
            'turn_id' => 'aaaaaaaa-bbbb-4ccc-8ddd-' . str_pad((string) (AiPendingAction::count() + 1), 12, '0', STR_PAD_LEFT),
            // Both columns carry a real foreign key. The hand-rolled fixture
            // table this test used to build had neither, so it could write a
            // conversation-less row the package's own schema forbids.
            'conversation_id' => $this->conversation()->id,
            'user_id' => $this->owner->id,
            'server_uuid' => null,
            'scope' => 'admin',
            'tool_name' => 'admin_product_create',
            'tool_call_id' => 'call-1',
            'risk' => 'write',
            'arguments' => [],
            'state' => [],
            'step' => 1,
            'status' => AiPendingAction::STATUS_PENDING,
            'expires_at' => now()->addMinutes(30),
        ], $overrides));
    }
}

class PendingClaimHarness
{
    use HandlesAgentTurns;

    public function claim(AiPendingAction $pending): bool
    {
        return $this->claimPending($pending);
    }

    public function recover(AiPendingAction $pending): void
    {
        $this->recoverStaleClaim($pending);
    }

    protected function agentRunner(): AgentRunner
    {
        throw new \LogicException();
    }

    protected function toolRegistry(): ToolRegistry
    {
        throw new \LogicException();
    }

    protected function toolRiskGate(): RiskGate
    {
        throw new \LogicException();
    }

    protected function turnRecorder(): TurnRecorder
    {
        throw new \LogicException();
    }

    protected function providerFactory(): ProviderFactory
    {
        throw new \LogicException();
    }
}
