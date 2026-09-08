import { HelpButton, HelpSteps, createTranslator } from '@/extensions-sdk';

const t = createTranslator('custom_domains');

// The "?" guide for operators. This module is a Cloudflare-backed vanity-domain
// system and its moving parts (zones, API tokens, per-egg SRV service tags) are
// not obvious — this walkthrough explains the whole setup end to end.
export function AdminCustomDomainsHelp() {
    return (
        <HelpButton title={t('admin.help.title', 'Custom domains — operator guide')} label={t('admin.help.open', 'How custom domains work')}>
            <div className="flex flex-col gap-5">
                <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
                    {t('admin.help.intro', 'This module lets you offer branded, player-friendly domains. You curate a catalog of parent domains backed by Cloudflare; server owners then create subdomains on them, and the panel provisions the real DNS records for them.')}
                </p>
                <HelpSteps
                    steps={[
                        { title: t('admin.help.step1.title', 'Add a Cloudflare API key'), body: t('admin.help.step1.body', 'Under API Keys, store a Cloudflare API token with DNS edit permission for the zones you will use. Tokens are write-only and never shown again.') },
                        { title: t('admin.help.step2.title', 'Register a domain'), body: t('admin.help.step2.body', 'Under Domains, add each parent domain, link it to its Cloudflare zone and API key, and optionally restrict it to specific games.') },
                        { title: t('admin.help.step3.title', 'Tune the defaults'), body: t('admin.help.step3.body', 'Set the SRV service tag and per-egg overrides so Minecraft- and Rust-family servers get the correct records automatically.') },
                        { title: t('admin.help.step4.title', 'Enable the module'), body: t('admin.help.step4.body', 'In Settings, turn the module on. Once enabled, the Custom Domains tab appears on servers whose game is allowed.') },
                    ]}
                />
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                        {t('admin.help.concepts.title', 'Key terms')}
                    </h3>
                    <dl className="mt-2 flex flex-col gap-2 text-sm text-[var(--color-ink-muted)]">
                        <div>
                            <dt className="inline font-medium text-[var(--color-ink)]">
                                {t('admin.help.concepts.zone', 'Cloudflare zone')}{' '}
                            </dt>
                            <dd className="inline">{t('admin.help.concepts.zoneBody', 'The domain as it exists in Cloudflare. The zone ID can be left blank — it is resolved automatically from the API key on first use.')}</dd>
                        </div>
                        <div>
                            <dt className="inline font-medium text-[var(--color-ink)]">
                                {t('admin.help.concepts.apiKey', 'API key')}{' '}
                            </dt>
                            <dd className="inline">{t('admin.help.concepts.apiKeyBody', 'A Cloudflare token used to create and delete DNS records. One key can back many domains.')}</dd>
                        </div>
                        <div>
                            <dt className="inline font-medium text-[var(--color-ink)]">
                                {t('admin.help.concepts.serviceTag', 'Service tag')}{' '}
                            </dt>
                            <dd className="inline">{t('admin.help.concepts.serviceTagBody', 'The SRV prefix (e.g. _minecraft._) that tells clients how to find the server. Auto-detected per game; override per egg if needed.')}</dd>
                        </div>
                        <div>
                            <dt className="inline font-medium text-[var(--color-ink)]">
                                {t('admin.help.concepts.restrictions', 'Game restrictions')}{' '}
                            </dt>
                            <dd className="inline">{t('admin.help.concepts.restrictionsBody', 'Leave nests and eggs unchecked to offer a domain to every game, or check specific ones to limit who can use it.')}</dd>
                        </div>
                    </dl>
                </div>
            </div>
        </HelpButton>
    );
}
