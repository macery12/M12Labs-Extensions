import { HelpButton, HelpSteps, createTranslator } from '@/extensions-sdk';

const t = createTranslator('custom_domains');

// The "?" guide for the server owner. Plain-language explanation of what a
// custom domain is and how to set one up, since the feature (and its SRV/CNAME
// distinction) is not obvious.
export function CustomDomainsHelp() {
    return (
        <HelpButton title={t('server.help.title', 'Custom domains — quick guide')} label={t('server.help.open', 'How custom domains work')}>
            <div className="flex flex-col gap-5">
                <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
                    {t('server.help.intro', 'Custom domains let players connect using a friendly address like play.example.com instead of a raw IP and port.')}
                </p>
                <HelpSteps
                    steps={[
                        { title: t('server.help.step1.title', 'Pick a domain'), body: t('server.help.step1.body', 'Choose one of the parent domains your host has made available, then type the subdomain label you want in front of it.') },
                        { title: t('server.help.step2.title', 'We create the DNS'), body: t('server.help.step2.body', 'When you add a mapping we automatically create the matching DNS records at the domain\'s provider and point them at your server.') },
                        { title: t('server.help.step3.title', 'Watch the status'), body: t('server.help.step3.body', 'A mapping starts as Pending, becomes Active once the records are live, or Failed if something went wrong — the error is shown so you can fix it or retry with Re-sync.') },
                        { title: t('server.help.step4.title', 'Share the address'), body: t('server.help.step4.body', 'Once a mapping is Active, share the full domain with your players. Use the copy button next to each entry.') },
                    ]}
                />
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                        {t('server.help.records.title', 'SRV vs CNAME')}
                    </h3>
                    <dl className="mt-2 flex flex-col gap-2 text-sm text-[var(--color-ink-muted)]">
                        <div>
                            <dt className="inline font-medium text-[var(--color-ink)]">
                                {t('server.help.records.srv', 'SRV')}{' '}
                            </dt>
                            <dd className="inline">{t('server.help.records.srvBody', 'Lets players connect with just the domain (no :port). Recommended for Minecraft-family servers.')}</dd>
                        </div>
                        <div>
                            <dt className="inline font-medium text-[var(--color-ink)]">
                                {t('server.help.records.cname', 'CNAME')}{' '}
                            </dt>
                            <dd className="inline">{t('server.help.records.cnameBody', 'Points the domain at your server; players usually connect with the domain plus :port.')}</dd>
                        </div>
                    </dl>
                    <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
                        {t('server.help.records.auto', 'The right record type is chosen automatically based on your game — you only need to change it if you know you want something different.')}
                    </p>
                </div>
            </div>
        </HelpButton>
    );
}
