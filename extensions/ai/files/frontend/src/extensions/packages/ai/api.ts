import { createExtensionClient } from '@/extensions-sdk';
import {
    streamAgentRequest,
    type ActiveAgentTurn,
    type AgentStreamCallbacks,
    type AiApprovalPreview,
    type AiRisk,
} from './agentStream';

// Per-server surface: POST /agent for the tool-calling agent, which can suspend
// mid-turn and be resumed by /agent/decide, plus the conversation store behind
// the history rail.
//
// Every path is relative to this package's own namespace under the server, so
// none of them names /api/ or the extension id. The client is built per call
// rather than held: it is a closure over two strings, and a module-level one
// would pin whichever server happened to be open first.
//
// Read endpoints answer `{ data: ... }` rather than the panel's item/list
// envelope, so the SDK client hands the body back untouched and the `.data`
// below is the package's own shape.

const client = (uuid: string) => createExtensionClient('ai', uuid);
export type ChatRole = 'user' | 'assistant' | 'tool';

/** A stored message, including the tool steps an agent turn produced. */
export interface StoredMessage {
    role: ChatRole;
    content: string | null;
    tool_calls:
        | {
              id: string;
              name: string;
              arguments: Record<string, unknown>;
              batch_parent_id?: string | null;
              batch_index?: number | null;
          }[]
        | null;
    tool_call_id: string | null;
    tool_name: string | null;
    step: number | null;
}

export interface AiConversation {
    id: number;
    title: string;
    is_saved: boolean;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface AgentTurnStatus {
    turn_id: string;
    status: 'running' | 'success' | 'error' | 'suspended' | 'cancelled';
    terminal: boolean;
    error?: string;
    conversation_id?: number;
    redactions?: Record<string, string>;
    messages?: StoredMessage[];
    pending?:
        | {
              kind: 'approval';
              turn_id: string;
              tool: string;
              arguments: Record<string, unknown>;
              risk: AiRisk;
              preview?: AiApprovalPreview;
          }
        | {
              kind: 'question';
              turn_id: string;
              tool: string;
              question: string;
              options: { label: string; description?: string }[];
              allow_other: boolean;
          };
}

export async function getAgentTurnStatus(uuid: string, turnId: string): Promise<AgentTurnStatus> {
    const data = await client(uuid).get<{ data: AgentTurnStatus }>(`/agent/turns/${turnId}`);
    return data.data;
}

/**
 * Start an agent turn.
 *
 * No history is sent: the backend replays what it stored. A turn also opens its
 * own conversation when none is named, and reports the id back on the stream.
 */
export function streamAgentTurn(
    uuid: string,
    opts: { query: string; conversationId?: number | null; console?: string | null; ticket?: string },
    callbacks: AgentStreamCallbacks,
    signal?: AbortSignal,
): void {
    streamAgentRequest(
        client(uuid),
        '/agent',
        {
            query: opts.query,
            conversation_id: opts.conversationId ?? undefined,
            console: opts.console ?? undefined,
            // The queue place this attempt already holds, if the last one was
            // turned away. Without it the turn rejoins at the back.
            ticket: opts.ticket ?? undefined,
        },
        callbacks,
        signal,
    );
}

/**
 * The turn this user currently has in flight on this server, if any.
 *
 * What a freshly mounted page asks so it can rejoin one. Nothing could answer
 * this before: the status endpoint needs a turn id a reloaded page no longer
 * has, and the pending endpoint only knows about turns that already stopped for
 * a decision — so a page that came back mid-turn had no way to tell a working
 * assistant from an idle one, and showed the idle one.
 */
export async function getActiveAgentTurn(uuid: string): Promise<ActiveAgentTurn | null> {
    const data = await client(uuid).get<{ data: ActiveAgentTurn | null }>('/agent/active');
    return data.data ?? null;
}

/**
 * Read a durable turn, resuming from a cursor.
 *
 * `after` is the last sequence this client saw. Reconnecting replays only what
 * was missed, so leaving the page and coming back costs the gap rather than the
 * whole transcript — and several tabs can watch one turn without competing,
 * because the relay holds nothing the turn needs.
 */
export function streamAgentRelay(
    uuid: string,
    turnId: string,
    after: number,
    callbacks: AgentStreamCallbacks,
    signal?: AbortSignal,
): void {
    streamAgentRequest(
        client(uuid),
        `/agent/turns/${turnId}/stream?after=${Math.max(0, after)}`,
        null,
        callbacks,
        signal,
    );
}

/**
 * Resolve whatever the turn suspended on, and resume it.
 *
 * `confirmation` carries the typed server name a destructive action requires;
 * `answer` carries the user's reply when the model asked a question.
 */
export function streamAgentDecision(
    uuid: string,
    opts: {
        turnId: string;
        decision: 'approve' | 'reject' | 'answer';
        confirmation?: string;
        answer?: string;
        ticket?: string;
    },
    callbacks: AgentStreamCallbacks,
    signal?: AbortSignal,
): void {
    streamAgentRequest(
        client(uuid),
        '/agent/decide',
        {
            turn_id: opts.turnId,
            decision: opts.decision,
            confirmation: opts.confirmation ?? undefined,
            answer: opts.answer ?? undefined,
            ticket: opts.ticket ?? undefined,
        },
        callbacks,
        signal,
    );
}

/**
 * Ask a running turn to stop.
 *
 * Aborting the stream only stops the browser reading; the turn carries on
 * spending budget and running tools. This is the half that reaches the server.
 * It reports that the request was recorded, not that the turn has ended — a
 * tool already in flight always finishes — so the caller reconciles afterwards
 * for the terminal state.
 */
export async function cancelAgentTurn(uuid: string, turnId: string): Promise<void> {
    await client(uuid).post(`/agent/turns/${turnId}/cancel`);
}

/** Give up a queue place, rather than letting it lapse on its own. */
export async function releaseAgentQueue(uuid: string, ticket: string): Promise<void> {
    await client(uuid).delete(`/agent/queue/${encodeURIComponent(ticket)}`);
}

export async function listConversations(uuid: string): Promise<AiConversation[]> {
    const data = await client(uuid).get<{ data: AiConversation[] }>('/conversations');
    return data.data;
}

export interface ConversationPayload {
    conversation: AiConversation;
    messages: StoredMessage[];
    /** token => the value it stands for, for anything redacted on the way to the model. */
    redactions: Record<string, string>;
}

export async function loadConversation(uuid: string, id: number): Promise<ConversationPayload> {
    const data = await client(uuid).get<{ data: ConversationPayload }>(`/conversations/${id}`);
    return { ...data.data, redactions: data.data.redactions ?? {} };
}

export async function deleteConversation(uuid: string, id: number): Promise<void> {
    await client(uuid).delete(`/conversations/${id}`);
}

export async function toggleSaveConversation(
    uuid: string,
    id: number,
): Promise<Pick<AiConversation, 'id' | 'is_saved' | 'expires_at'>> {
    const data = await client(uuid).patch<{ data: Pick<AiConversation, 'id' | 'is_saved' | 'expires_at'> }>(`/conversations/${id}/save`);
    return data.data;
}
