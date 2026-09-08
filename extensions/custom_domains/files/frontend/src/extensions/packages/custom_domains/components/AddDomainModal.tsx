import { Button, Field, Input, Modal, Select, Spinner, createTranslator, extensionErrorMessage, notify } from '@/extensions-sdk';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import {
    getCustomDomainOptions,
    createCustomDomain,
    type CustomDomainOption,
    type RecordType,
} from '../api';

const t = createTranslator('custom_domains');

export function AddDomainModal({
    uuid,
    port,
    onClose,
    onSaved,
}: {
    uuid: string;
    port: number;
    onClose: () => void;
    onSaved: () => void;
}) {
    const qc = useQueryClient();

    const { data: options, isLoading } = useQuery({
        queryKey: ['server', uuid, 'custom-domains', 'options'],
        queryFn: ({ signal }) => getCustomDomainOptions(uuid, signal),
    });

    const [domainId, setDomainId] = useState<string>('');
    const [subdomain, setSubdomain] = useState('');
    const [recordType, setRecordType] = useState<RecordType>('cname');
    const [serviceTag, setServiceTag] = useState('');
    // Whether the user has picked a record type manually yet (so we can keep the
    // field in sync with the selected domain's recommendation until they do).
    const [recordTouched, setRecordTouched] = useState(false);

    const selected: CustomDomainOption | undefined = useMemo(
        () => options?.find(o => String(o.id) === domainId),
        [options, domainId],
    );

    // Effective record type: forced by the egg profile, or the user's choice,
    // else the backend recommendation for the selected domain.
    const effectiveRecordType: RecordType = selected?.forcedRecordType
        ? selected.forcedRecordType
        : recordTouched
          ? recordType
          : (selected?.recommendedRecordType ?? 'cname');

    const showRecordPicker = Boolean(selected?.allowRecordTypeSelection && !selected?.forcedRecordType);
    const showServiceTag = effectiveRecordType === 'srv';

    const selectDomain = (id: string) => {
        setDomainId(id);
        setRecordTouched(false);
        const opt = options?.find(o => String(o.id) === id);
        setServiceTag(opt?.defaultServiceTag ?? '');
    };

    const create = useMutation({
        mutationFn: () =>
            createCustomDomain(uuid, {
                domainId: Number(domainId),
                subdomain: subdomain.trim().toLowerCase(),
                port,
                recordType: effectiveRecordType,
                serviceTag: showServiceTag ? serviceTag.trim() || null : null,
            }),
        onSuccess: () => {
            notify('success', t('server.created', 'Custom domain added — provisioning has been queued.'));
            qc.invalidateQueries({ queryKey: ['server', uuid, 'custom-domains'] });
            onSaved();
        },
        onError: err => notify('error', extensionErrorMessage(err, t('common.states.genericError', 'Something went wrong. Please try again.'))),
    });

    const canSubmit = domainId !== '' && subdomain.trim() !== '' && !create.isPending;
    const preview = selected && subdomain.trim() ? `${subdomain.trim().toLowerCase()}.${selected.domain}` : null;

    return (
        <Modal
            open
            onClose={onClose}
            title={t('server.add.title', 'Add a custom domain')}
            description={t('server.add.subtitle', 'Create a friendly address that points at this server.')}
            footer={
                <>
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={create.isPending}>
                        {t('common.actions.cancel', 'Cancel')}
                    </Button>
                    <Button size="sm" onClick={() => create.mutate()} disabled={!canSubmit}>
                        {create.isPending && <Spinner className="h-4 w-4" />}
                        {t('server.add.submit', 'Add domain')}
                    </Button>
                </>
            }
        >
            {isLoading ? (
                <div className="flex justify-center py-10">
                    <Spinner className="h-5 w-5" />
                </div>
            ) : !options || options.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">
                    {t('server.add.noDomains', 'No domains are available for this server yet. Ask your host to enable one.')}
                </p>
            ) : (
                <div className="flex flex-col gap-4">
                    <Field label={t('server.add.domainLabel', 'Domain')} htmlFor="cd-domain">
                        <Select
                            id="cd-domain"
                            value={domainId || undefined}
                            onChange={selectDomain}
                            placeholder={t('server.add.domainPlaceholder', 'Choose a domain')}
                            options={options.map(o => ({ value: String(o.id), label: o.domain }))}
                        />
                    </Field>

                    <Field
                        label={t('server.add.subdomainLabel', 'Subdomain')}
                        hint={t('server.add.subdomainHint', 'Just the part before the domain, e.g. "play".')}
                        htmlFor="cd-subdomain"
                    >
                        <Input
                            id="cd-subdomain"
                            value={subdomain}
                            onChange={e => setSubdomain(e.target.value)}
                            placeholder={t('server.add.subdomainPlaceholder', 'play')}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </Field>

                    {preview && (
                        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
                            <p className="text-xs text-[var(--color-ink-faint)]">
                                {t('server.add.previewLabel', 'Players will connect to')}
                            </p>
                            <p className="mt-0.5 font-mono text-sm text-[var(--color-ink)]">{preview}</p>
                        </div>
                    )}

                    {showRecordPicker && (
                        <Field label={t('server.add.recordTypeLabel', 'Record type')} htmlFor="cd-record">
                            <Select
                                id="cd-record"
                                value={effectiveRecordType}
                                onChange={v => {
                                    setRecordTouched(true);
                                    setRecordType(v as RecordType);
                                }}
                                options={[
                                    { value: 'srv', label: t('server.recordType.srv', 'SRV') },
                                    { value: 'cname', label: t('server.recordType.cname', 'CNAME') },
                                ]}
                            />
                        </Field>
                    )}

                    {showServiceTag && (
                        <Field
                            label={t('server.add.serviceTagLabel', 'Service tag')}
                            hint={t('server.add.serviceTagHint', 'Advanced. Leave as-is unless you know you need a different SRV service.')}
                            htmlFor="cd-service-tag"
                        >
                            <Input
                                id="cd-service-tag"
                                value={serviceTag}
                                onChange={e => setServiceTag(e.target.value)}
                                placeholder="_minecraft._"
                                autoComplete="off"
                                spellCheck={false}
                            />
                        </Field>
                    )}

                    {selected?.recommendationNotice && (
                        <div className="flex gap-2.5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--brand-soft)] px-4 py-3">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" />
                            <div className="min-w-0 text-sm text-[var(--color-ink-muted)]">
                                <p>{selected.recommendationNotice}</p>
                                {selected.connectionHint && (
                                    <p className="mt-1 text-xs text-[var(--color-ink-faint)]">{selected.connectionHint}</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
