import { Button, Field, Input, Modal, Spinner, Switch, createTranslator, extensionErrorMessage, notify } from '@/extensions-sdk';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    createCustomDomainApiKey,
    updateCustomDomainApiKey,
    type CustomDomainApiKey,
} from '../api';

const t = createTranslator('custom_domains');

export function ApiKeyEditorModal({
    apiKey,
    onClose,
}: {
    apiKey: CustomDomainApiKey | null; // null → create
    onClose: () => void;
}) {
    const editing = apiKey !== null;
    const qc = useQueryClient();

    const [name, setName] = useState(apiKey?.name ?? '');
    const [token, setToken] = useState('');
    const [enabled, setEnabled] = useState(apiKey?.enabled ?? true);

    const save = useMutation({
        mutationFn: () => {
            if (editing) {
                return updateCustomDomainApiKey(apiKey.id, {
                    name: name.trim(),
                    token: token.trim() || undefined,
                    enabled,
                });
            }
            return createCustomDomainApiKey({ name: name.trim(), token: token.trim(), enabled });
        },
        onSuccess: () => {
            notify('success', t('common.states.saved', 'Saved'));
            qc.invalidateQueries({ queryKey: ['admin', 'custom-domains', 'api-keys'] });
            onClose();
        },
        onError: err => notify('error', extensionErrorMessage(err, t('common.states.genericError', 'Something went wrong. Please try again.'))),
    });

    const canSubmit = name.trim() !== '' && (editing || token.trim() !== '') && !save.isPending;

    return (
        <Modal
            open
            onClose={onClose}
            title={editing ? t('admin.apiKeys.editTitle', 'Edit API key') : t('admin.apiKeys.createTitle', 'Add Cloudflare API key')}
            footer={
                <>
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={save.isPending}>
                        {t('common.actions.cancel', 'Cancel')}
                    </Button>
                    <Button size="sm" onClick={() => save.mutate()} disabled={!canSubmit}>
                        {save.isPending && <Spinner className="h-4 w-4" />}
                        {t('common.actions.save', 'Save')}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <Field label={t('admin.apiKeys.nameLabel', 'Name')} htmlFor="ak-name">
                    <Input id="ak-name" value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
                </Field>
                <Field
                    label={t('admin.apiKeys.tokenLabel', 'Cloudflare API token')}
                    hint={editing ? t('admin.apiKeys.tokenHintEdit', 'Leave blank to keep the current token.') : t('admin.apiKeys.tokenHint', 'A token with DNS edit permission. Stored securely and never shown again.')}
                    htmlFor="ak-token"
                >
                    <Input
                        id="ak-token"
                        type="password"
                        value={token}
                        onChange={e => setToken(e.target.value)}
                        placeholder={editing ? t('admin.apiKeys.tokenPlaceholderEdit', '•••••••• (unchanged)') : ''}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </Field>
                <label className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-[var(--color-ink-muted)]">
                        {t('admin.apiKeys.enabledLabel', 'Enabled')}
                    </span>
                    <Switch checked={enabled} onChange={setEnabled} />
                </label>
            </div>
        </Modal>
    );
}
