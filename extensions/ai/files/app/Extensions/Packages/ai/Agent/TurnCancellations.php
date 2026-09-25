<?php

namespace Everest\Extensions\Packages\ai\Agent;

use Everest\Extensions\Packages\ai\Models\AiUsageLog;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Everest\Extensions\Packages\ai\Inference\InferenceGate;
use Everest\Extensions\Packages\ai\Support\AiBudgetService;

/**
 * Stopping a turn that is already running. Two properties pull in opposite
 * directions:
 *
 * 1. **A stop must survive the request that asked for it.** Asker and turn are
 *    different PHP processes, so the record is a column on the turn's usage row
 *    rather than a flag in memory.
 * 2. **A stop must never arrive mid-effect.** Tools are HTTP calls that cannot
 *    be un-started, so cancellation is only *observed* where nothing is
 *    half-done: between steps, before a dispatch, and between batch children. A
 *    tool in flight always finishes and reports.
 *
 * So a cancel is a request, not an instruction, and the columns say so:
 * `cancel_requested_at` is when the user asked, the `cancelled` status is when
 * the turn actually stopped.
 *
 * Reads are throttled rather than memoised, since the point is to observe a
 * write from a *different* process; only the positive is cached, as
 * cancellation does not un-happen.
 */
class TurnCancellations
{
    /**
     * How stale an unobserved cancellation may be. Rarely the binding constraint
     * — boundaries are seconds apart — but it stops a fast batch of small calls
     * turning one flag into a query per child.
     */
    private const RECHECK_SECONDS = 1.0;

    /** What a turn stopped before any worker picked it up is recorded as. */
    public const STOPPED_BEFORE_START = 'You stopped this turn before it started.';

    private const STASH_KEY = 'ext-ai:turn-handles:';

    /** @var array<string, bool> */
    private array $cancelled = [];

    /** @var array<string, float> */
    private array $lastReadAt = [];

    /**
     * Ask a running turn to stop. Conditional on the row still being `running`,
     * so racing clicks produce one request and a turn that already finished is
     * not retroactively cancelled. A suspended turn is not cancellable here —
     * nothing is executing, and the user wants to decline the card on screen.
     *
     * @return bool whether this call is the one that recorded the request
     */
    public function request(AiUsageLog $usage): bool
    {
        $recorded = AiUsageLog::whereKey($usage->id)
            ->where('status', 'running')
            ->whereNull('cancel_requested_at')
            ->update(['cancel_requested_at' => now()]);

        if ($recorded === 1) {
            $this->cancelled[(string) $usage->turn_id] = true;
        }

        return $recorded === 1;
    }

    /**
     * Stop a turn nothing has started executing yet, completely and now.
     *
     * A queued turn has no worker to deliver a Stop to, and may never get
     * one -- a lane with no process, a backlog, a worker pool being restarted.
     * Leaving a note for it kept the turn `running` until its deadline, the
     * composer locked, and the user's slot and budget held the whole time.
     * Conditional on the row being unclaimed, so a worker that claims it first
     * wins and this does nothing; the worker then sees the Stop at its first
     * boundary instead.
     *
     * @return bool whether this call ended the turn
     */
    public function stopUnclaimed(AiUsageLog $usage): bool
    {
        $stopped = AiUsageLog::whereKey($usage->id)
            ->where('status', 'running')
            ->whereNull('claimed_at')
            ->update([
                'status' => 'cancelled',
                'error_message' => self::STOPPED_BEFORE_START,
                'cancel_requested_at' => $usage->cancel_requested_at ?? now(),
                'heartbeat_at' => now(),
            ]);

        if ($stopped !== 1) {
            return false;
        }

        $this->cancelled[(string) $usage->turn_id] = true;

        try {
            // So a relay reading the log closes rather than waiting for frames
            // no worker will ever write.
            app(AgentEventLog::class)->append((string) $usage->turn_id, AgentEvent::done('cancelled'));
        } catch (\Throwable $e) {
            Log::warning('Could not close the event log of a turn stopped before it started.', [
                'turn' => $usage->turn_id,
                'exception' => $e::class,
            ]);
        }

        $this->releaseStashed((string) $usage->turn_id);

        return true;
    }

    /**
     * Stop whatever is running in a conversation that is about to be deleted.
     *
     * Deleting the chat used to leave its turn going: the row lost its
     * conversation to the foreign key and carried on, still holding the
     * composer, still reattached on every reload.
     */
    public function stopForConversation(int $conversationId, int $userId): void
    {
        $running = AiUsageLog::query()
            ->where('conversation_id', $conversationId)
            ->where('user_id', $userId)
            ->where('status', 'running')
            ->get();

        foreach ($running as $usage) {
            if (!$this->stopUnclaimed($usage)) {
                $this->request($usage);
            }
        }
    }

    /**
     * Keep what a queued turn is holding where a Stop can give it back.
     *
     * The inference slot and budget reservation travel to the worker inside
     * the job, which is no help to a Stop that arrives before any worker does.
     * Both releases are owner-qualified and idempotent, so the worker releasing
     * its own copy later is harmless.
     *
     * @param array<string, mixed>|null $lease
     * @param array<string, mixed>|null $budget
     */
    public function stash(string $turnId, ?array $lease, ?array $budget, int $ttlSeconds): void
    {
        if ($lease === null && $budget === null) {
            return;
        }

        Cache::put(self::STASH_KEY . $turnId, ['lease' => $lease, 'budget' => $budget], $ttlSeconds);
    }

    /** The worker claimed the turn and holds its own copy; drop this one. */
    public function forgetStash(string $turnId): void
    {
        Cache::forget(self::STASH_KEY . $turnId);
    }

    private function releaseStashed(string $turnId): void
    {
        $held = Cache::pull(self::STASH_KEY . $turnId);

        if (!is_array($held)) {
            return;
        }

        try {
            if (is_array($held['lease'] ?? null)) {
                app(InferenceGate::class)->releaseHandle($held['lease']);
            }

            if (is_array($held['budget'] ?? null)) {
                app(AiBudgetService::class)->releaseHandle($held['budget']);
            }
        } catch (\Throwable $e) {
            // Both self-expire; failing to hand them back early is a delay,
            // not a leak.
            Log::warning('Could not release what a stopped queued turn was holding.', [
                'turn' => $turnId,
                'exception' => $e::class,
            ]);
        }
    }

    /**
     * Whether the user has asked for this turn to stop.
     */
    public function requested(string $turnId): bool
    {
        if ($this->cancelled[$turnId] ?? false) {
            return true;
        }

        $now = microtime(true);
        if ($now - ($this->lastReadAt[$turnId] ?? 0.0) < self::RECHECK_SECONDS) {
            return false;
        }

        $this->lastReadAt[$turnId] = $now;

        try {
            $asked = AiUsageLog::query()
                ->where('turn_id', $turnId)
                ->whereNotNull('cancel_requested_at')
                ->exists();
        } catch (\Throwable $e) {
            // Fail open, deliberately. This read is the *delivery* of a stop,
            // not the record of one — the record is the column, and it stays
            // written. A database that cannot answer is not evidence that the
            // user pressed Stop, and treating it as though it were would end
            // every turn in flight the moment the connection wobbled.
            Log::warning('Could not read the cancellation flag for an AI turn.', [
                'turn' => $turnId,
                'exception' => $e::class,
            ]);

            return false;
        }

        return $this->cancelled[$turnId] = $asked;
    }
}
