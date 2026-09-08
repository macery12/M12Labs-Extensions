import { Button, Field, Input, Modal, Select, Spinner, Switch, createTranslator, extensionErrorMessage, notify } from '@/extensions-sdk';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createAdminCustomDomain,
    updateAdminCustomDomain,
    getCustomDomainCatalogOptions,
    getCustomDomainApiKeys,
    type AdminCustomDomain,
    type DomainPayload,
} from '../api';

const t = createTranslator('custom_domains');

// A themed checkbox row used for the nest/egg allow-lists.
function CheckRow({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
    return (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[var(--color-surface-2)]">
            <input
                type="checkbox"
                checked={checked}
                onChange={e => onChange(e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-[var(--color-border-strong)] accent-[var(--brand)]"
            />
            <span className="min-w-0">
                <span className="block truncate text-sm text-[var(--color-ink)]">{label}</span>
                {sub && <span className="block truncate text-xs text-[var(--color-ink-faint)]">{sub}</span>}
            </span>
        </label>
    );
}

export function DomainEditorModal({
    domain,
    onClose,
}: {
    domain: AdminCustomDomain | null; // null → create
    onClose: () => void;
}) {
    const editing = domain !== null;
    const qc = useQueryClient();

    const { data: options } = useQuery({
        queryKey: ['admin', 'custom-domains', 'catalog-options'],
        queryFn: ({ signal }) => getCustomDomainCatalogOptions(signal),
    });
    const { data: apiKeys } = useQuery({
        queryKey: ['admin', 'custom-domains', 'api-keys'],
        queryFn: ({ signal }) => getCustomDomainApiKeys(signal),
    });

    const [name, setName] = useState(domain?.domain ?? '');
    const [zoneId, setZoneId] = useState(domain?.cloudflareZoneId ?? '');
    const [apiKeyId, setApiKeyId] = useState<string>(domain?.apiKeyId ? String(domain.apiKeyId) : '');
    const [nestIds, setNestIds] = useState<number[]>(domain?.allowedNestIds ?? []);
    const [eggIds, setEggIds] = useState<number[]>(domain?.allowedEggIds ?? []);
    const [serviceTag, setServiceTag] = useState(domain?.serviceTag ?? '');
    const [eggTags, setEggTags] = useState<Record<string, string>>(domain?.eggServiceTags ?? {});
    const [wildcard, setWildcard] = useState(domain?.wildcardEnabled ?? false);
    const [enabled, setEnabled] = useState(domain?.enabled ?? true);

    const toggle = (set: React.Dispatch<React.SetStateAction<number[]>>, id: number) =>
        set(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

    const allowedEggs = useMemo(
        () => (options?.eggs ?? []).filter(e => eggIds.includes(e.id)),
        [options, eggIds],
    );

    const save = useMutation({
        mutationFn: () => {
            const payload: DomainPayload = {
                domain: name.trim().toLowerCase(),
                cloudflare_zone_id: zoneId.trim() || null,
                api_key_id: apiKeyId ? Number(apiKeyId) : null,
                allowed_nest_ids: nestIds,
                allowed_egg_ids: eggIds,
                service_tag: serviceTag.trim() || null,
                egg_service_tags: Object.fromEntries(
                    Object.entries(eggTags).filter(([, v]) => v.trim() !== ''),
                ),
                wildcard_enabled: wildcard,
                enabled,
            };
            return editing ? updateAdminCustomDomain(domain.id, payload) : createAdminCustomDomain(payload);
        },
        onSuccess: () => {
            notify('success', t('common.states.saved', 'Saved'));
            qc.invalidateQueries({ queryKey: ['admin', 'custom-domains', 'domains'] });
            onClose();
        },
        onError: err => notify('error', extensionErrorMessage(err, t('common.states.genericError', 'Something went wrong. Please try again.'))),
    });

    const canSubmit = name.trim() !== '' && !save.isPending;

    return (
        <Modal
            open
            onClose={onClose}
            size="lg"
            title={editing ? t('admin.domains.editTitle', 'Edit domain') : t('admin.domains.createTitle', 'Add domain')}
            description={t('admin.domains.editSubtitle', 'Link the domain to its Cloudflare zone and choose which games may use it.')}
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
            <div className="flex flex-col gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('admin.domains.domainLabel', 'Domain')} hint={t('admin.domains.domainHint', 'The parent domain, e.g. example.gg.')} htmlFor="dm-domain">
                        <Input id="dm-domain" value={name} onChange={e => setName(e.target.value)} placeholder="example.gg" autoComplete="off" spellCheck={false} />
                    </Field>
                    <Field label={t('admin.domains.zoneLabel', 'Cloudflare zone ID')} hint={t('admin.domains.zoneHint', 'Cloudflare zone ID. Leave blank to resolve automatically.')} htmlFor="dm-zone">
                        <Input id="dm-zone" value={zoneId} onChange={e => setZoneId(e.target.value)} autoComplete="off" spellCheck={false} />
                    </Field>
                </div>

                <Field label={t('admin.domains.apiKeyLabel', 'Cloudflare API key')} hint={t('admin.domains.apiKeyHint', 'Cloudflare token used to manage this domain\'s DNS.')} htmlFor="dm-apikey">
                    <Select
                        id="dm-apikey"
                        value={apiKeyId || undefined}
                        onChange={setApiKeyId}
                        placeholder={t('admin.domains.apiKeyPlaceholder', 'Select an API key')}
                        options={(apiKeys ?? []).map(k => ({ value: String(k.id), label: k.name }))}
                    />
                </Field>

                <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                        <p className="text-sm font-medium text-[var(--color-ink-muted)]">
                            {t('admin.domains.nestsLabel', 'Allowed games (nests)')}
                        </p>
                        <p className="mb-2 text-xs text-[var(--color-ink-faint)]">
                            {t('admin.domains.allowAllHint', 'Leave empty to allow everything.')}
                        </p>
                        <div className="max-h-44 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-1">
                            {(options?.nests ?? []).map(n => (
                                <CheckRow key={n.id} checked={nestIds.includes(n.id)} onChange={() => toggle(setNestIds, n.id)} label={n.name} />
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-[var(--color-ink-muted)]">
                            {t('admin.domains.eggsLabel', 'Allowed eggs')}
                        </p>
                        <p className="mb-2 text-xs text-[var(--color-ink-faint)]">
                            {t('admin.domains.allowAllHint', 'Leave empty to allow everything.')}
                        </p>
                        <div className="max-h-44 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-1">
                            {(options?.eggs ?? []).map(e => (
                                <CheckRow
                                    key={e.id}
                                    checked={eggIds.includes(e.id)}
                                    onChange={() => toggle(setEggIds, e.id)}
                                    label={e.name}
                                    sub={e.nest_name ?? undefined}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <Field label={t('admin.domains.serviceTagLabel', 'Default service tag')} hint={t('admin.domains.serviceTagHint', 'Default SRV prefix for this domain, e.g. _minecraft._. Leave blank to auto-detect.')} htmlFor="dm-tag">
                    <Input id="dm-tag" value={serviceTag} onChange={e => setServiceTag(e.target.value)} placeholder="_minecraft._" autoComplete="off" spellCheck={false} />
                </Field>

                {allowedEggs.length > 0 && (
                    <div>
                        <p className="text-sm font-medium text-[var(--color-ink-muted)]">
                            {t('admin.domains.eggTagsLabel', 'Per-egg service tags')}
                        </p>
                        <p className="mb-2 text-xs text-[var(--color-ink-faint)]">
                            {t('admin.domains.eggTagsHint', 'Override the SRV prefix for a specific egg. Leave blank to use the default.')}
                        </p>
                        <div className="flex flex-col gap-2">
                            {allowedEggs.map(e => (
                                <div key={e.id} className="flex items-center gap-3">
                                    <span className="w-40 shrink-0 truncate text-sm text-[var(--color-ink)]">{e.name}</span>
                                    <Input
                                        value={eggTags[String(e.id)] ?? ''}
                                        onChange={ev => setEggTags(prev => ({ ...prev, [String(e.id)]: ev.target.value }))}
                                        placeholder={e.default_service_tag ?? '_minecraft._'}
                                        autoComplete="off"
                                        spellCheck={false}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
                    <label className="flex items-center justify-between gap-4">
                        <span className="min-w-0">
                            <span className="block text-sm font-medium text-[var(--color-ink)]">
                                {t('admin.domains.wildcardLabel', 'Allow wildcard subdomains')}
                            </span>
                            <span className="block text-xs text-[var(--color-ink-muted)]">
                                {t('admin.domains.wildcardHint', 'Let users create *.this-domain records.')}
                            </span>
                        </span>
                        <Switch checked={wildcard} onChange={setWildcard} />
                    </label>
                    <label className="flex items-center justify-between gap-4">
                        <span className="min-w-0">
                            <span className="block text-sm font-medium text-[var(--color-ink)]">
                                {t('admin.domains.enabledLabel', 'Available to users')}
                            </span>
                            <span className="block text-xs text-[var(--color-ink-muted)]">
                                {t('admin.domains.enabledHint', 'Turn off to hide this domain without deleting it.')}
                            </span>
                        </span>
                        <Switch checked={enabled} onChange={setEnabled} />
                    </label>
                </div>
            </div>
        </Modal>
    );
}
