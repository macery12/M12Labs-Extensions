<?php

namespace Everest\Tests\Unit\Extensions\ai\Http;

use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Everest\Extensions\Packages\ai\Http\Requests\GetIntelligenceRequest;
use Everest\Extensions\Packages\ai\Http\Controllers\IntelligenceController;

/**
 * A fresh install has no usage rows, and `SUM()` over none is NULL. The limits
 * page formatted that NULL as a number and crashed, so every count here has to
 * arrive as an integer -- zero when there is nothing to count.
 */
class StatsOnAnEmptyLogTest extends AiPackageTestCase
{
    public function testCountsAreZeroNotNull(): void
    {
        $request = GetIntelligenceRequest::create('/', 'GET');
        $request->setContainer($this->app);

        $stats = $this->app->make(IntelligenceController::class)->stats($request)->getData(true);

        $this->assertSame(0, $stats['last_7d']['tokens']);
        $this->assertSame(0, $stats['last_24h']['requests']);
        $this->assertSame(0, $stats['all_time']['total_tokens']);
        $this->assertSame(0, $stats['latency']['under_1s']);
        $this->assertNull($stats['latency']['avg_ms']);
        $this->assertNull($stats['all_time']['avg_latency_ms']);
        $this->assertSame(0, $stats['daily_series'][0]['requests']);
    }
}
