import { Pencil, ShieldAlert, X } from 'lucide-react';
import type { AssistSession } from '../state/agentChat';
import { cn, createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

// The standing notice that this conversation is inside a customer's server.
//
// Deliberately a banner rather than a transcript row. A row scrolls away, and
// twenty messages later there would be nothing on screen distinguishing "reading
// the panel's own records" from "reading a paying customer's files" — a
// distinction that should never be something an administrator has to reconstruct
// by scrolling. It stays until the session is ended.
export function AssistBanner({ session, onEnd }: { session: AssistSession; onEnd?: () => void }) {
    return (
        <div
            className={cn(
                'flex items-start gap-2.5 border px-3 py-2.5 text-xs',
                session.writable
                    ? 'border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10'
                    : 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)]',
            )}
            style={{ borderRadius: 'var(--radius-card)' }}
        >
            {session.writable ? (
                <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
            ) : (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-muted)]" />
            )}

            <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--color-ink)]">
                    {session.writable
                        ? t('admin.assist.writable', 'Editing {server}', { server: session.serverName })
                        : t('admin.assist.readOnly', 'Reading {server}', { server: session.serverName })}
                </p>
                {session.reason !== '' && (
                    <p className="mt-0.5 text-[var(--color-ink-muted)]">{session.reason}</p>
                )}
                <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">{t('admin.assist.logged', 'This session appears in the customer\'s own activity log.')}</p>
            </div>

            {onEnd && (
                <button
                    type="button"
                    onClick={onEnd}
                    title={t('admin.assist.end', 'End session')}
                    className="shrink-0 rounded p-1 text-[var(--color-ink-faint)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
                >
                    <X className="h-3.5 w-3.5" />
                    <span className="sr-only">{t('admin.assist.end', 'End session')}</span>
                </button>
            )}
        </div>
    );
}
