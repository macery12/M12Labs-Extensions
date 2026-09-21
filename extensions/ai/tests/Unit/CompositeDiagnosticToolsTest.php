<?php

namespace Everest\Tests\Unit\Extensions\ai;

use Everest\Models\User;
use Everest\Models\Server;
use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Everest\Extensions\Packages\ai\Agent\WorkingSet;
use Everest\Extensions\Packages\ai\Agent\AgentRunner;
use Everest\Services\Access\DelegatedGrant;
use Everest\Extensions\Packages\ai\Agent\AgentContext;
use Everest\Extensions\Packages\ai\Tools\ToolRegistry;
use Everest\Extensions\Packages\ai\Tools\ToolDefinition;
use Everest\Extensions\Packages\ai\Tools\Definitions\AdminTools;
use Everest\Extensions\Packages\ai\Tools\Definitions\ServerTools;

class CompositeDiagnosticToolsTest extends AiPackageTestCase
{
    public function testCompositeToolsAreSafeHostFacadesOverExistingReads(): void
    {
        $registry = app(ToolRegistry::class);
        $snapshot = $registry->find(ServerTools::DIAGNOSTIC_SNAPSHOT);
        $ticket = $registry->find(AdminTools::TICKET_CONTEXT);

        $this->assertNotNull($snapshot);
        $this->assertNotNull($ticket);
        $this->assertTrue($snapshot->hostHandled);
        $this->assertTrue($ticket->hostHandled);
        $this->assertSame(ToolDefinition::RISK_SAFE, $snapshot->risk);
        $this->assertSame(ToolDefinition::RISK_SAFE, $ticket->risk);
        $this->assertContains(ServerTools::DIAGNOSTIC_SNAPSHOT, WorkingSet::RESERVED[WorkingSet::PHASE_READ_ASSIST]);
    }

    public function testTicketFacadeKeepsTheAssistSessionsApprovedTicketBoundary(): void
    {
        $user = User::factory()->make();
        $server = (new Server())->forceFill([
            'id' => 17,
            'uuid' => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            'owner_id' => 22,
            'name' => 'Ticket boundary',
        ]);
        $context = new AgentContext($user, null, 'composite-boundary');
        $context->bindAssist(DelegatedGrant::read(
            $server->uuid,
            $server->name,
            'Diagnose ticket 42',
            ticketId: 42,
        ), $server);
        $definition = app(ToolRegistry::class)->find(AdminTools::TICKET_CONTEXT);
        $allows = new \ReflectionMethod(AgentRunner::class, 'assistSubjectAllows');

        $this->assertTrue($allows->invoke(app(AgentRunner::class), $context, $definition, ['ticket' => '42']));
        $this->assertFalse($allows->invoke(app(AgentRunner::class), $context, $definition, ['ticket' => '43']));
    }
}
