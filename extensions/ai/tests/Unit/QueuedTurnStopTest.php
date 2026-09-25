<?php

namespace Everest\Tests\Unit\Extensions\ai;

use Everest\Models\User;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Everest\Extensions\Packages\ai\Models\AiUsageLog;
use Everest\Extensions\Packages\ai\Agent\TurnRecorder;
use Everest\Extensions\Packages\ai\Agent\AgentEventLog;
use Everest\Extensions\Packages\ai\Jobs\RunAgentTurnJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Everest\Extensions\Packages\ai\Agent\TurnCancellations;
use Everest\Extensions\Packages\ai\Agent\WorkerRequestScope;

/**
 * A durable turn is `running` from the moment it is accepted, which is before
 * any worker has it. With the long lane unstaffed it stayed that way: Stop
 * left a note nothing would read, deleting the chat left the turn going, and
 * the composer stayed locked until the deadline sweep eight minutes later.
 */
class QueuedTurnStopTest extends AiPackageTestCase
{
    use RefreshDatabase;

    private User $user;

    public function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
    }

    public function testStoppingAQueuedTurnEndsItAtOnce(): void
    {
        $usage = $this->turn();

        $this->assertTrue(app(TurnCancellations::class)->stopUnclaimed($usage));

        $usage->refresh();
        $this->assertSame('cancelled', $usage->status);
        $this->assertSame(TurnCancellations::STOPPED_BEFORE_START, $usage->error_message);
        $this->assertNotNull($usage->cancel_requested_at);

        // The relay closes rather than waiting for frames nobody will write.
        $frames = iterator_to_array(app(AgentEventLog::class)->replay((string) $usage->turn_id, 0), false);
        $this->assertSame('done', end($frames)['event']['type'] ?? null);
    }

    /** A turn a worker is executing is stopped at its next boundary instead. */
    public function testAClaimedTurnIsLeftToItsWorker(): void
    {
        $usage = $this->turn(claimed: true);

        $this->assertFalse(app(TurnCancellations::class)->stopUnclaimed($usage));
        $this->assertSame('running', $usage->fresh()->status);
    }

    public function testAWorkerDoesNotRunATurnStoppedWhileItWaited(): void
    {
        $usage = $this->turn();
        AiUsageLog::whereKey($usage->id)->update(['cancel_requested_at' => now()]);

        $this->runJob((string) $usage->turn_id);

        $usage->refresh();
        $this->assertSame('cancelled', $usage->status);
        $this->assertNull($usage->claimed_at);
    }

    /** The sweep already told the user it failed; running it now would be a surprise. */
    public function testAWorkerDoesNotReviveATurnThatAlreadyEnded(): void
    {
        $usage = $this->turn();
        AiUsageLog::whereKey($usage->id)->update(['status' => 'error', 'error_message' => 'swept']);

        $this->runJob((string) $usage->turn_id);

        $usage->refresh();
        $this->assertSame('error', $usage->status);
        $this->assertSame('swept', $usage->error_message);
        $this->assertNull($usage->claimed_at);
    }

    /** Picked up after its deadline: told plainly, not run ten minutes late. */
    public function testAWorkerDoesNotRunATurnThatWaitedPastItsDeadline(): void
    {
        $usage = $this->turn();
        AiUsageLog::whereKey($usage->id)->update(['deadline_at' => now()->subMinute()]);

        $this->runJob((string) $usage->turn_id);

        $usage->refresh();
        $this->assertSame('error', $usage->status);
        $this->assertStringContainsString('in time', (string) $usage->error_message);
        $this->assertNull($usage->claimed_at);
    }

    public function testAWorkerClaimsATurnBeforeRunningIt(): void
    {
        $usage = $this->turn();

        // An authority that no longer holds ends the turn right after the
        // claim, which is enough to see the claim happened first.
        $this->runJob((string) $usage->turn_id);

        $this->assertNotNull($usage->fresh()->claimed_at);
    }

    public function testDeletingAConversationStopsItsTurns(): void
    {
        $conversation = DB::table('ext_ai_conversations')->insertGetId([
            'user_id' => $this->user->id,
            'scope' => 'admin',
            'title' => 'Explain my startup settings',
            'expires_at' => now()->addDay(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $queued = $this->turn(conversationId: $conversation);
        $executing = $this->turn(claimed: true, conversationId: $conversation);

        app(TurnCancellations::class)->stopForConversation($conversation, $this->user->id);

        $this->assertSame('cancelled', $queued->fresh()->status);
        $this->assertSame('running', $executing->fresh()->status);
        $this->assertNotNull($executing->fresh()->cancel_requested_at);
    }

    private function turn(bool $claimed = false, ?int $conversationId = null): AiUsageLog
    {
        return AiUsageLog::create([
            'user_id' => $this->user->id,
            'server_uuid' => null,
            'conversation_id' => $conversationId,
            'turn_id' => (string) Str::uuid(),
            'step' => 0,
            'tool_calls_count' => 0,
            'model' => 'test-model',
            'source' => 'admin-agent',
            'prompt_tokens' => 0,
            'completion_tokens' => 0,
            'total_tokens' => 0,
            'latency_ms' => 0,
            'status' => 'running',
            'heartbeat_at' => now(),
            'deadline_at' => now()->addMinutes(8),
            'claimed_at' => $claimed ? now() : null,
        ]);
    }

    private function runJob(string $turnId): void
    {
        // A user id that does not exist: the authority cannot hold.
        $job = new RunAgentTurnJob(
            $turnId,
            ['user_id' => 999999, 'session_id' => null, 'ip' => '127.0.0.1', 'origin' => 'https://panel.test'],
            null,
            null,
            null,
            null,
            null,
        );

        $job->handle(app(AgentEventLog::class), app(WorkerRequestScope::class), app(TurnRecorder::class));
    }
}
