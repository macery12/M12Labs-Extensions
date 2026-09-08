import { Routes, Route } from 'react-router-dom';
import { createTranslator } from '@/extensions-sdk';
import { CustomDomainsNav } from '../../components/AdminDomainsNav';
import { AdminCustomDomainsHelp } from '../../components/AdminDomainsHelp';
import DomainsTab from '../../components/DomainsTab';
import ApiKeysTab from '../../components/ApiKeysTab';

const t = createTranslator('custom_domains');

/*
 * The package's admin screen, mounted by the panel at
 * /admin/extensions/ext/custom_domains/domains/* — the trailing splat is what
 * lets one declared page own its own sub-routing, so the tabs below keep real,
 * linkable URLs instead of becoming component state.
 *
 * It declares one page rather than three so the admin sidebar gets one entry
 * for the feature, as core had.
 *
 * There is no Settings tab. In core this page carried the module's enable
 * toggle, the Cloudflare token and the rate limits. All three now belong to the
 * panel: enabling is the extension's lifecycle state, the token is a declared
 * secret in the encrypted store, and the rest are declared settings fields the
 * panel validates against the manifest. They are edited from this extension's
 * drawer on the Extensions screen.
 */
export default function AdminCustomDomainsPage() {
    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
                        {t('admin.title', 'Custom Domains')}
                    </h1>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                        {t('admin.subtitle', 'Curate the domains users can build custom subdomains on.')}
                    </p>
                </div>
                <AdminCustomDomainsHelp />
            </header>

            <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
                <CustomDomainsNav />
                <div className="min-w-0 flex-1">
                    <Routes>
                        <Route index element={<DomainsTab />} />
                        <Route path="api-keys" element={<ApiKeysTab />} />
                    </Routes>
                </div>
            </div>
        </div>
    );
}
