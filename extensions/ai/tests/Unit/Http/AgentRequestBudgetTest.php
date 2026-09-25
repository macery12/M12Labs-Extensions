<?php

namespace Everest\Tests\Unit\Extensions\ai\Http;

use Everest\Tests\Extensions\ai\AiPackageTestCase;

/**
 * What bounds how much work one person can start.
 *
 * The panel gave the agent a rate limiter of its own, `ai.agent`, with two
 * budgets: 10 turn *starts* a minute, because a start performs admission and
 * persistence before any inference begins, and 120 queue-status checks, because
 * a client holding a place has to poll at the cadence the queue moves at.
 *
 * A package cannot register a rate limiter. Its routes are throttled by the
 * loader, under `api.ext-client` (120/min per extension, per user, per server)
 * and `api.ext-admin` (60/min) — one budget covering starts and polls together.
 * So that split is gone, and this file records what replaced it rather than
 * pretending the old limiter is still there.
 *
 * What still bounds a flood of starts:
 *
 * - `capabilities.streams.maxConcurrentPerUser`, which the panel enforces when
 *   the stream opens. A second turn does not get a connection.
 * - The package's own inference admission, which is what the concurrency
 *   settings configure and what refuses or queues beyond them.
 *
 * What is genuinely weaker: a start and a poll now spend from the same bucket,
 * so a client polling hard has less room to start turns, and 120 starts a
 * minute reach admission where 10 did. Admission refuses them — but it refuses
 * them after touching the database, which the limiter did not.
 */
class AgentRequestBudgetTest extends AiPackageTestCase
{
    /**
     * The stream capability is the surviving per-user bound, so it has to be
     * declared and it has to be finite.
     */
    public function testTheAgentStreamDeclaresAConcurrencyCeiling(): void
    {
        $stream = $this->aiCapabilitySet()->streamNamed('agent-turn');

        $this->assertNotNull($stream, 'The agent stream must be declared for the panel to bound it.');
        $this->assertGreaterThan(0, $stream->maxConcurrentPerUser);
        $this->assertLessThanOrEqual(4, $stream->maxConcurrentPerUser, 'A per-user ceiling this high is not a ceiling.');
    }

    /**
     * And the package must not have tried to keep its old limiter, which would
     * be a route-level middleware the loader does not allow it to set.
     */
    public function testThePackageDoesNotDeclareAThrottleOfItsOwn(): void
    {
        foreach (['client', 'admin'] as $surface) {
            $routes = file_get_contents(app_path("Extensions/Packages/ai/routes/{$surface}.php"));

            $this->assertStringNotContainsString('throttle:', $routes);
        }
    }
}
