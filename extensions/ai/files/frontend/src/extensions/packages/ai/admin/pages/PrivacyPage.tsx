import { ShieldCheck } from 'lucide-react';
import type { AiPiiCategory } from '../../adminApi';
import { useAiSettingsForm } from '../useAiSettingsForm';
import { AiLoadError } from '../LoadError';
import { SettingNotice } from '../SettingNotice';
import { cn, Spinner, SaveBar, SectionCard, ToggleGroup, ToggleRow, createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

// What is stripped out of tool results and panel-attached context before a
// request leaves the building. Never applied to what the administrator types:
// they chose to send it, and redacting it would break lookup by email for no
// gain.
export default function PrivacyPage() {
    const form = useAiSettingsForm(
        settings => ({
            enabled: settings.privacy?.enabled ?? true,
            // The backend resolves an unset list to the defaults, so what
            // arrives is always the categories actually in force rather than a
            // literal empty selection.
            categories: settings.privacy?.categories ?? [],
        }),
        value => ({ privacy: value }),
    );

    const { settings, value, patch } = form;

    if (form.isError) {
        return <AiLoadError onRetry={form.retry} />;
    }

    if (form.isLoading || !value || !settings) {
        return (
            <div className="flex justify-center py-16">
                <Spinner className="h-6 w-6" />
            </div>
        );
    }

    const available = settings.privacy?.available ?? [];
    const forced = settings.privacy?.forced ?? false;

    // Rebuilt in `available` order on every change rather than appended to, so
    // toggling a category off and back on does not leave the list looking
    // different from the one on file and the form reading as dirty.
    const toggle = (category: AiPiiCategory, on: boolean) => {
        const next = new Set(value.categories);
        if (on) next.add(category);
        else next.delete(category);

        patch({ categories: available.filter(entry => next.has(entry)) });
    };

    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={event => {
                event.preventDefault();
                form.submit();
            }}
        >
            <SectionCard
                icon={ShieldCheck}
                title={t('admin.settings.privacy', 'Privacy')}
                desc={t('admin.pages.privacyDesc', 'Pattern and field-name masking applied before a request leaves the panel. This reduces exposure but does not de-identify free text, and never applies to what you type.')}
            >
                {forced && (
                    <SettingNotice title={t('admin.settings.privacyForcedTitle', 'Redaction required by OpenRouter')}>
                        {t('admin.settings.privacyForcedBody', 'OpenRouter is a public hosted provider, so redaction is locked on for every category. Your saved privacy choices are preserved and return when you switch providers.')}
                    </SettingNotice>
                )}

                <ToggleGroup>
                    <ToggleRow
                        label={t('admin.settings.privacyEnabled', 'Strip personal data before sending')}
                        desc={t('admin.settings.privacyEnabledHint', 'Masks supported patterns and fields in tool results and attached context. Names or postal addresses in unstructured prose may still reach the AI provider; use provider privacy controls or external DLP where that is unacceptable. What you type is never redacted.')}
                        checked={value.enabled}
                        onChange={next => patch({ enabled: next })}
                        disabled={forced}
                    />
                </ToggleGroup>

                <div className={cn('flex flex-col gap-3', (!value.enabled || forced) && 'opacity-55')}>
                    <div>
                        <p className="text-sm font-medium text-[var(--color-ink)]">
                            {t('admin.settings.privacyCategories', 'What to strip')}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--color-ink-faint)]">
                            {t('admin.settings.privacyCategoriesHint', 'Categories use exact field names and the conservative prose patterns described below. Name and postal-address masking is field-only.')}
                        </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                        {available.map(category => (
                            <label
                                key={category}
                                className={cn(
                                    'flex cursor-pointer items-start gap-2.5 rounded-md border border-[var(--color-border)] px-3 py-2 transition-colors',
                                    value.enabled && !forced && 'hover:border-[var(--color-border-strong)]',
                                    (!value.enabled || forced) && 'pointer-events-none',
                                )}
                            >
                                <input
                                    type="checkbox"
                                    className="mt-0.5 accent-[var(--brand)]"
                                    checked={value.categories.includes(category)}
                                    disabled={!value.enabled || forced}
                                    onChange={event => toggle(category, event.target.checked)}
                                />
                                <span className="min-w-0">
                                    <span className="block text-xs font-medium text-[var(--color-ink)]">
                                        {t(`admin.settings.pii.${category}`, category)}
                                    </span>
                                    <span className="mt-0.5 block text-[11px] text-[var(--color-ink-faint)]">
                                        {t(`admin.settings.pii.${category}Hint`, '')}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {forced && (
                    <p className="text-xs text-[var(--color-warning)]">
                        {t('admin.settings.privacyProseLimit', 'Names and postal addresses in unstructured prose cannot be guaranteed redacted. Deliberately typed user messages are sent unchanged.')}
                    </p>
                )}
            </SectionCard>

            <SaveBar dirty={form.dirty} saving={form.saving} onDiscard={form.discard} />
        </form>
    );
}
