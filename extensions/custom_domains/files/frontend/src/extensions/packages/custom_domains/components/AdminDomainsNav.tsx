import { cn, createTranslator } from '@/extensions-sdk';
import { NavLink } from 'react-router-dom';
import { Globe, KeyRound, type LucideIcon } from 'lucide-react';

const t = createTranslator('custom_domains');

interface Item {
    to: string;
    end?: boolean;
    icon: LucideIcon;
    label: string;
}

// The panel owns the mount point for an extension page; this is the path it
// mounts the declared `domains` admin page at, plus the splat that lets the
// page keep real sub-URLs.
const BASE = '/admin/extensions/ext/custom_domains/domains';

const ITEMS: Item[] = [
    { to: BASE, end: true, icon: Globe, label: t('admin.nav.domains', 'Domains') },
    { to: `${BASE}/api-keys`, icon: KeyRound, label: t('admin.nav.apiKeys', 'API Keys') },
];

// In-page left rail. There is no Settings entry: the panel owns this
// extension's settings and its Cloudflare secret, both edited from the
// extension's drawer on the Extensions screen.
export function CustomDomainsNav() {
    return (
        <nav className="flex shrink-0 gap-1 overflow-x-auto pb-2 lg:w-52 lg:flex-col lg:overflow-visible lg:pb-0">
            {ITEMS.map(item => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                        cn(
                            'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                                ? 'bg-[var(--brand)]/15 text-[var(--color-ink)] ring-1 ring-[var(--brand)]/30'
                                : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
                        )
                    }
                >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                </NavLink>
            ))}
        </nav>
    );
}
