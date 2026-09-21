import { Hourglass } from 'lucide-react';
import type { QueuePosition } from '../state/agentChat';
import { createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

// Shown while a turn waits for an inference slot.
//
// A self-hosted GPU serves a fixed number of requests at once; past that,
// queueing beats thrashing. Saying so — with a position and an estimate — is
// the difference between "the panel is slow" and "four people are ahead of you".
export function QueueBanner({ queue }: { queue: QueuePosition }) {
    return (
        <div className="flex items-center gap-2.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)]/60 px-3 py-2 text-xs">
            <Hourglass className="h-3.5 w-3.5 shrink-0 animate-pulse text-[var(--brand)]" />
            <span className="text-[var(--color-ink)]">
                {queue.ahead === 0
                    ? t('server.queue.next', 'You\'re next in the queue…')
                    : t('server.queue.waiting', 'Waiting for a free slot — {ahead} ahead of you', { ahead: queue.ahead })}
            </span>
            {queue.etaSeconds > 0 && (
                <span className="text-[var(--color-ink-faint)]">
                    {t('server.queue.eta', 'about {seconds}s', { seconds: queue.etaSeconds })}
                </span>
            )}
        </div>
    );
}
