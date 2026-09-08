import { Button, ConfirmDialog, Spinner, createTranslator, extensionErrorMessage, notify } from '@/extensions-sdk';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Pencil, Trash2 } from 'lucide-react';
import {
    getCustomDomainApiKeys,
    deleteCustomDomainApiKey,
    type CustomDomainApiKey,
} from '../api';
import { ApiKeyEditorModal } from './ApiKeyEditorModal';

const t = createTranslator('custom_domains');

export default function ApiKeysPage() {
    const qc = useQueryClient();
    const key = ['admin', 'custom-domains', 'api-keys'];

    const { data, isLoading, isError } = useQuery({
        queryKey: key,
        queryFn: ({ signal }) => getCustomDomainApiKeys(signal),
    });

    const [editor, setEditor] = useState<{ key: CustomDomainApiKey | null } | null>(null);
    const [toDelete, setToDelete] = useState<CustomDomainApiKey | null>(null);

    const keys = data ?? [];

    const remove = useMutation({
        mutationFn: (id: number) => deleteCustomDomainApiKey(id),
        onSuccess: () => {
            notify('success', t('admin.apiKeys.deleted', 'API key deleted.'));
            setToDelete(null);
            qc.invalidateQueries({ queryKey: key });
        },
        onError: err => notify('error', extensionErrorMessage(err, t('common.states.genericError', 'Something went wrong. Please try again.'))),
    });

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                        {t('admin.apiKeys.title', 'Cloudflare API keys')}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                        {t('admin.apiKeys.subtitle', 'Cloudflare tokens used to provision DNS records.')}
                    </p>
                </div>
                <Button onClick={() => setEditor({ key: null })}>
                    <Plus className="h-4 w-4" />
                    {t('admin.apiKeys.add', 'Add API key')}
                </Button>
            </div>

            <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
                {isLoading ? (
                    <div className="flex justify-center py-14">
                        <Spinner className="h-5 w-5" />
                    </div>
                ) : isError ? (
                    <p className="px-4 py-10 text-center text-sm text-[var(--color-danger)]">
                        {t('admin.loadError', 'Couldn\'t load custom domains.')}
                    </p>
                ) : keys.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                        <KeyRound className="h-8 w-8 text-[var(--color-ink-faint)]" />
                        <p className="text-sm text-[var(--color-ink-muted)]">{t('admin.apiKeys.empty', 'No API keys yet. Add a Cloudflare token to get started.')}</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-[var(--color-border)]">
                        {keys.map(k => (
                            <li key={k.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-[var(--color-ink)]">{k.name}</span>
                                        <span
                                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                            style={
                                                k.enabled
                                                    ? { backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)' }
                                                    : { backgroundColor: 'var(--color-surface-2)', color: 'var(--color-ink-faint)' }
                                            }
                                        >
                                            {k.enabled ? t('common.states.enabled', 'Enabled') : t('common.states.disabled', 'Disabled')}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 font-mono text-xs text-[var(--color-ink-faint)]">
                                        {t('admin.apiKeys.tokenHidden', 'Token hidden')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t('common.actions.edit', 'Edit')}
                                        onClick={() => setEditor({ key: k })}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t('common.actions.delete', 'Delete')}
                                        className="text-[var(--color-danger)]"
                                        onClick={() => setToDelete(k)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {editor && <ApiKeyEditorModal apiKey={editor.key} onClose={() => setEditor(null)} />}

            <ConfirmDialog
                open={!!toDelete}
                onClose={() => setToDelete(null)}
                title={t('admin.apiKeys.deleteTitle', 'Delete API key')}
                body={t('admin.apiKeys.deleteBody', 'Delete the API key “{name}”? This fails if it is still assigned to a domain.', { name: toDelete?.name ?? '' })}
                confirmLabel={t('common.actions.delete', 'Delete')}
                cancelLabel={t('common.actions.cancel', 'Cancel')}
                busy={remove.isPending}
                onConfirm={() => toDelete && remove.mutate(toDelete.id)}
            />
        </div>
    );
}
