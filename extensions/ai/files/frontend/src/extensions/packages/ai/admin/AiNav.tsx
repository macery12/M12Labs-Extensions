import {
    Activity,
    Bot,
    Gauge,
    ListOrdered,
    Plug,
    ShieldCheck,
    SlidersHorizontal,
    Wallet,
    Wrench,
} from 'lucide-react';
import { SectionNavigation, type SectionNavigationGroup, createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

// Absolute paths — relative `to` would compound against the active route.
// The panel mounts an admin page at /admin/extensions/ext/<id>/<slug>, and a
// package never invents that prefix: it is derived from the package directory
// on the server, so hardcoding a shorter one would break the moment the
// extension id or the slug changed.
export const BASE = '/admin/extensions/ext/ai/settings';

function groups(): SectionNavigationGroup[] {
    return [
        {
            id: 'connection',
            label: t('admin.nav.groups.connection', 'Connection'),
            items: [
                { to: BASE, end: true, icon: Activity, label: t('admin.nav.overview', 'Overview') },
                { to: `${BASE}/provider`, icon: Plug, label: t('admin.nav.provider', 'Provider & model') },
                { to: `${BASE}/generation`, icon: SlidersHorizontal, label: t('admin.nav.generation', 'Generation') },
            ],
        },
        {
            id: 'assistants',
            label: t('admin.nav.groups.assistants', 'Assistants'),
            items: [
                { to: `${BASE}/agent`, icon: Bot, label: t('admin.nav.agent', 'Agent') },
                { to: `${BASE}/tools`, icon: Wrench, label: t('admin.nav.tools', 'Tools') },
                { to: `${BASE}/privacy`, icon: ShieldCheck, label: t('admin.nav.privacy', 'Privacy') },
            ],
        },
        {
            id: 'operations',
            label: t('admin.nav.groups.operations', 'Operations'),
            items: [
                { to: `${BASE}/performance`, icon: Gauge, label: t('admin.nav.performance', 'Performance') },
                { to: `${BASE}/limits`, icon: Wallet, label: t('admin.nav.limits', 'Budget & access') },
                { to: `${BASE}/logs`, icon: ListOrdered, label: t('admin.nav.logs', 'Logs') },
            ],
        },
    ];
}

// In-page secondary navigation for the AI section — a left rail on lg+, a
// horizontal scroll strip on small screens. Mirrors EmailNav.
//
// Every item is always shown, including ones whose settings the configured
// provider ignores. Those pages explain themselves instead; a rail that
// reshuffles when you change a dropdown is worse than a page that says why it
// is empty.
export function AiNav() {
    return <SectionNavigation groups={groups()} />;
}
