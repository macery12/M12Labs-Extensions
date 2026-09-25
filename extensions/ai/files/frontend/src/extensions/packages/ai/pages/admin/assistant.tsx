import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PanelLeftClose, PanelLeftOpen, Sparkles, TriangleAlert } from 'lucide-react';
import { AgentChatView } from '../../components/AgentChatView';
import { useFillViewport } from '../../components/useFillViewport';
import { ConversationRail } from '../../components/ConversationRail';
import { DeleteConversationModal } from '../../components/DeleteConversationModal';
import { sessionCounters, type DetailGroup } from '../../components/detailFields';
import { AiLoadError } from '../../admin/LoadError';
import { ADMIN_AGENT_TARGET, useAdminAgentChat } from '../../state/agentChat';
import type { ChatRole } from '../../api';
import {
    deleteAdminAgentConversation,
    endAdminAssist,
    getAdminAgentConversation,
    getAiSettings,
    listAdminAgentConversations,
    type AdminAgentConversation,
} from '../../adminApi';
import { useExtensionViewer, Spinner, createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

// The admin assistant uses the shared conversation rail and agent-only workflow.

const RAIL_KEY = 'v2:admin:ai:rail';

export default function AssistantPage() {
    const queryClient = useQueryClient();
    const viewer = useExtensionViewer();
    const fillRef = useFillViewport<HTMLDivElement>();
    const [deleteTarget, setDeleteTarget] = useState<AdminAgentConversation | null>(null);
    const [railOpen, setRailOpen] = useState(
        () => window.matchMedia('(min-width: 1024px)').matches && localStorage.getItem(RAIL_KEY) !== 'closed',
    );

    const loading = useAdminAgentChat(s => s.loading);
    const entries = useAdminAgentChat(s => s.entries);
    const step = useAdminAgentChat(s => s.step);
    const assist = useAdminAgentChat(s => s.assist);
    const conversationId = useAdminAgentChat(s => s.conversationId);
    const newChat = useAdminAgentChat(s => s.newChat);
    const beginTranscriptLoad = useAdminAgentChat(s => s.beginTranscriptLoad);
    const loadTranscript = useAdminAgentChat(s => s.loadTranscript);
    const loadFailed = useAdminAgentChat(s => s.loadFailed);
    const setAssist = useAdminAgentChat(s => s.setAssist);

    // Read from settings rather than the injected feature flags: those are
    // rendered once per page load, so an operator who has just switched the
    // assistant on would be told it is off until they reloaded.
    const {
        data: settings,
        isLoading: settingsLoading,
        isError: settingsError,
        refetch: refetchSettings,
    } = useQuery({
        queryKey: ['admin', 'ai', 'settings'],
        queryFn: getAiSettings,
    });

    const enabled = Boolean(settings?.agent.enabled && settings?.agent.admin_enabled);

    const { data: conversations = [], isLoading: conversationsLoading } = useQuery({
        queryKey: ['admin', 'ai', 'agent-conversations'],
        queryFn: listAdminAgentConversations,
        enabled,
    });

    useEffect(() => {
        if (!loading) {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'ai', 'agent-conversations'] });
        }
    }, [loading, queryClient]);

    const desktopRail = () => window.matchMedia('(min-width: 1024px)').matches;
    const toggleRail = () => {
        setRailOpen(open => {
            if (desktopRail()) localStorage.setItem(RAIL_KEY, open ? 'closed' : 'open');
            return !open;
        });
    };
    const closeMobileRail = () => {
        if (!desktopRail()) setRailOpen(false);
    };

    const open = async (conversation: AdminAgentConversation) => {
        if (loading) return;

        closeMobileRail();

        const generation = beginTranscriptLoad(ADMIN_AGENT_TARGET, conversation.id);
        try {
            const loaded = await getAdminAgentConversation(conversation.id);
            const applied = loadTranscript(
                ADMIN_AGENT_TARGET,
                loaded.id,
                generation,
                loaded.messages
                    // System prompts are not part of the user-visible transcript.
                    .filter(message => message.role !== 'system')
                    // Preserve call identity and arguments for reopened audit rows.
                    .map(message => ({
                        role: message.role as ChatRole,
                        content: message.content,
                        tool_name: message.tool_name,
                        tool_call_id: message.tool_call_id,
                        tool_calls: message.tool_calls,
                        step: message.step,
                    })),
                loaded.redactions,
            );

            if (applied && loaded.assist) {
                setAssist({
                    serverUuid: loaded.assist.server_uuid,
                    serverName: loaded.assist.server_name,
                    writable: loaded.assist.writable,
                    reason: loaded.assist.reason,
                });
            }
        } catch {
            loadFailed(ADMIN_AGENT_TARGET, generation);
        }
    };

    const endAssist = async () => {
        if (conversationId === null) {
            setAssist(null);

            return;
        }

        try {
            await endAdminAssist(conversationId);
        } finally {
            setAssist(null);
        }
    };

    const remove = async (conversation: AdminAgentConversation) => {
        await deleteAdminAgentConversation(conversation.id);
        if (conversationId === conversation.id) newChat();
        await queryClient.invalidateQueries({ queryKey: ['admin', 'ai', 'agent-conversations'] });
        closeMobileRail();
    };

    if (settingsLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Spinner className="h-7 w-7" />
            </div>
        );
    }

    if (settingsError) {
        return <AiLoadError onRetry={() => void refetchSettings()} />;
    }

    if (!enabled) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--color-border)] px-6 py-16 text-center">
                <TriangleAlert className="h-6 w-6 text-[var(--color-warning)]" />
                <p className="text-sm font-medium text-[var(--color-ink)]">{t('admin.agent.disabledTitle', 'The admin assistant is switched off')}</p>
                <p className="max-w-md text-sm text-[var(--color-ink-muted)]">{t('admin.agent.disabledBody', 'Turn it on under Settings → Agent. It acts on the panel itself, so it is gated separately from the assistant your customers see.')}</p>
            </div>
        );
    }

    const counters = sessionCounters(entries);

    // An assist session is the one thing on this surface that is about somebody
    // else's property, so it leads the column. The banner above the composer
    // still carries the warning and the End control; this says which server,
    // permanently, in the place every other fact about the session lives.
    const detail: DetailGroup[] = [
        {
            label: t('server.detail.groupTarget', 'Target'),
            rows: assist
                ? [
                      { label: t('server.detail.server', 'server'), value: assist.serverName },
                      {
                          label: t('server.detail.access', 'access'),
                          value: assist.writable
                              ? t('server.detail.writable', 'writable')
                              : t('server.detail.readOnly', 'read-only'),
                          tone: assist.writable ? 'warn' : 'default',
                      },
                      ...(assist.reason !== ''
                          ? [{ label: t('server.detail.reason', 'reason'), value: assist.reason }]
                          : []),
                  ]
                : [],
        },
        {
            label: t('server.detail.groupTurn', 'Turn'),
            rows: step
                ? [
                      {
                          label: t('server.detail.step', 'step'),
                          value: `${step.step} / ${step.maxSteps}`,
                          meter: step.maxSteps > 0 ? step.step / step.maxSteps : undefined,
                      },
                  ]
                : [],
        },
        {
            label: t('server.detail.groupSession', 'This session'),
            rows: [
                { label: t('server.detail.turns', 'turns'), value: String(counters.turns) },
                { label: t('server.detail.reads', 'reads'), value: String(counters.reads) },
                { label: t('server.detail.changes', 'changes'), value: String(counters.changes) },
            ],
        },
    ];

    return (
        <div
            ref={fillRef}
            className="relative flex overflow-hidden rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)]/70"
        >
            {railOpen && (
                <>
                    <button
                        type="button"
                        aria-label={t('server.hideHistory', 'Hide history')}
                        onClick={() => setRailOpen(false)}
                        className="absolute inset-0 z-10 bg-black/50 lg:hidden"
                    />
                    <ConversationRail
                        conversations={conversations}
                        loading={conversationsLoading}
                        activeId={conversationId}
                        assistingId={assist ? conversationId : null}
                        newChatLabel={t('server.newChat', 'New chat')}
                        onNewChat={() => {
                            newChat();
                            closeMobileRail();
                        }}
                        onOpen={conversation => void open(conversation)}
                        onDelete={setDeleteTarget}
                        onClose={() => setRailOpen(false)}
                        className="absolute inset-y-0 left-0 z-20 w-[min(14rem,calc(100%-3rem))] shadow-2xl lg:static lg:z-auto lg:w-56 lg:shadow-none"
                    />
                </>
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <header className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--color-border-strong)] px-3">
                    <button
                        type="button"
                        onClick={toggleRail}
                        title={railOpen ? t('server.hideHistory', 'Hide history') : t('server.showHistory', 'Show history')}
                        className="rounded-sm p-1 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                    >
                        {railOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
                    </button>
                    <Sparkles className="h-3.5 w-3.5 text-[var(--brand)]" />
                    <span className="text-[13px] font-medium text-[var(--color-ink)]">
                        {t('admin.agent.title', 'Admin assistant')}
                    </span>
                </header>

                <AgentChatView
                    store={useAdminAgentChat}
                    // Destructive assist cards carry their live server name in
                    // the approval preview. This fallback is used only for a
                    // future destructive admin action without a server target.
                    confirmPhrase={t('admin.agent.confirmPhrase', 'confirm')}
                    emptyTitle={t('admin.agent.emptyTitle', 'Ask about the panel')}
                    emptySubtitle={t('admin.agent.emptySubtitle', 'I can look up customers, servers, products, coupons and tickets, and make changes to the catalogue for you to approve. I cannot reach into a customer’s server — open that server’s own assistant for that.')}
                    placeholder={t('admin.agent.placeholder', 'Ask about customers, products, coupons or tickets…')}
                    disclaimer={t('admin.agent.disclaimer', 'The assistant only acts through your own admin permissions, and every change is shown to you first.')}
                    detail={detail}
                    // Several administrators share this surface, and an assist
                    // session is auditable work on a customer's server — so which
                    // of them asked is information, not decoration. The server
                    // route passes nothing, where it would only ever say "You".
                    speaker={viewer?.username ?? t('server.you', 'You')}
                    suggestions={[
                        t('admin.agent.suggestCatalogue', 'What products do we sell?'),
                        t('admin.agent.suggestCoupon', 'Create a 20% renewal coupon'),
                        t('admin.agent.suggestUsers', 'Show me suspended users'),
                        t('admin.agent.suggestTickets', 'Which tickets are still open?'),
                    ]}
                    onEndAssist={() => void endAssist()}
                />
            </div>

            {deleteTarget && (
                <DeleteConversationModal
                    title={deleteTarget.title}
                    onClose={() => setDeleteTarget(null)}
                    onDelete={() => remove(deleteTarget)}
                />
            )}
        </div>
    );
}
