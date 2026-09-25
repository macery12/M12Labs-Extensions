import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BotOff } from 'lucide-react';
import { useAgentChat } from '../state/agentChat';
import { AgentChatView } from './AgentChatView';
import { sessionCounters, type DetailGroup } from './detailFields';
import { useExtensionServerContext, createTranslator, useExtensionFlag } from '@/extensions-sdk';

const t = createTranslator('ai');

// The server assistant: everything server-specific about a conversation, over
// the shared view. Rendered identically by the full page and the dock drawer;
// only the chrome around it differs.

export function AgentChat({ compact = false }: { compact?: boolean }) {
    const { server } = useExtensionServerContext();
    const queryClient = useQueryClient();

    const loading = useAgentChat(s => s.loading);
    const entries = useAgentChat(s => s.entries);
    const step = useAgentChat(s => s.step);

    const agentAvailable = useExtensionFlag('ai', 'agent-ready');

    // A settled turn may have opened a conversation, or retitled one.
    useEffect(() => {
        if (!loading) {
            void queryClient.invalidateQueries({ queryKey: ['server', server.uuid, 'ai-conversations'] });
        }
    }, [loading, queryClient, server.uuid]);

    // Without the agent there is no assistant left to render. This used to fall
    // back to advisory chat, which is exactly the fallback that was cut: a chat
    // that cannot read the server answers confidently about a machine it has
    // never seen. Saying so is the honest end of that decision.
    if (!agentAvailable) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                <BotOff className="h-8 w-8 text-[var(--color-ink-faint)]" />
                <p className="text-sm font-medium text-[var(--color-ink)]">
                    {t('server.agentDisabledTitle', 'The assistant is turned off')}
                </p>
                <p className="max-w-sm text-xs text-[var(--color-ink-muted)]">
                    {t('server.agentDisabledBody', 'An administrator needs to enable the AI agent before this server’s assistant can be used.')}
                </p>
            </div>
        );
    }

    const counters = sessionCounters(entries);

    // Deliberately thinner than the admin column. Node, lane, ticket and the
    // audit link are operator concerns; a customer looking at their own server
    // has no use for them, and a column padded out with rows that mean nothing
    // to the person reading is worse than a short one.
    const detail: DetailGroup[] = [
        {
            label: t('server.detail.groupServer', 'Server'),
            rows: [
                { label: t('server.detail.server', 'server'), value: server.name },
                {
                    label: t('server.detail.state', 'state'),
                    value: server.status ?? t('server.detail.unknown', 'unknown'),
                    tone: server.status === 'running' ? 'good' : server.status ? 'warn' : 'default',
                },
            ],
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
            label: t('server.detail.groupChat', 'This chat'),
            rows: [
                { label: t('server.detail.turns', 'turns'), value: String(counters.turns) },
                { label: t('server.detail.reads', 'reads'), value: String(counters.reads) },
                { label: t('server.detail.changes', 'changes'), value: String(counters.changes) },
            ],
        },
    ];

    return (
        <AgentChatView
            store={useAgentChat}
            compact={compact}
            confirmPhrase={server.name}
            emptyTitle={t('server.emptyAgentTitle', 'What should I do for your server?')}
            emptySubtitle={t('server.emptyAgentSubtitle', 'Ask me to change a setting, read a config, take a backup or look into a crash on {name}. I\'ll show you what I\'m about to do before I do it.', { name: server.name })}
            placeholder={t('server.composerAgentPlaceholder', 'Ask me to do something…')}
            disclaimer={t('server.agentDisclaimer', 'The agent acts with your permissions and asks before it changes anything.')}
            detail={detail}
            suggestions={[
                t('server.suggestions.crash', 'Why did my server crash?'),
                t('server.suggestions.performance', 'How can I reduce lag?'),
                t('server.suggestions.config', 'Explain my startup settings'),
                t('server.suggestions.mods', 'How do I install plugins or mods?'),
            ]}
        />
    );
}
