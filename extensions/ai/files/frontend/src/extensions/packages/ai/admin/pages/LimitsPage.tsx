import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { getAiStats } from '../../adminApi';
import { useAiCapabilities, useAiSettingsForm } from '../useAiSettingsForm';
import { AiLoadError } from '../LoadError';
import { Input, Spinner, FieldRow, SaveBar, SectionCard, ToggleGroup, ToggleRow, createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

// What the module is allowed to cost, and who is allowed to reach it.
export default function LimitsPage() {
    const form = useAiSettingsForm(
        settings => ({
            enforce: settings.budget?.enforce ?? false,
            monthly_tokens: settings.budget?.monthly_tokens ?? 2_000_000,
        }),
        value => ({
            budget: { enforce: value.enforce, monthly_tokens: value.monthly_tokens },
        }),
    );

    const { value, patch } = form;
    const capabilities = useAiCapabilities();
    const { data: stats } = useQuery({ queryKey: ['admin', 'ai', 'stats'], queryFn: getAiStats });

    if (form.isError) {
        return <AiLoadError onRetry={form.retry} />;
    }

    if (form.isLoading || !value) {
        return (
            <div className="flex justify-center py-16">
                <Spinner className="h-6 w-6" />
            </div>
        );
    }

    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={event => {
                event.preventDefault();
                form.submit();
            }}
        >
            <SectionCard
                icon={Wallet}
                title={t('admin.settings.budget', 'Token budget')}
                desc={
                    capabilities.budgetIsPrimary
                        ? t('admin.pages.budgetHostedDesc', 'This provider bills per token, so spend is the binding constraint. One agent turn is many model calls, and per-request rate limits give no meaningful ceiling.')
                        : t('admin.pages.budgetSelfHostedDesc', 'Self-hosted inference is bounded by hardware rather than spend, but a token ceiling still caps how much of the day one runaway turn can occupy.')
                }
                right={
                    stats ? (
                        <span className="text-xs text-[var(--color-ink-faint)] tabular-nums">
                            {t('admin.settings.tokensLast7d', '{tokens} tokens in the last 7 days', {
                                tokens: (stats.last_7d?.tokens ?? 0).toLocaleString(),
                            })}
                        </span>
                    ) : undefined
                }
            >
                <ToggleGroup>
                    <ToggleRow
                        label={t('admin.settings.budgetEnforce', 'Enforce monthly budget')}
                        desc={t('admin.settings.budgetEnforceHint', 'One agent turn is many model calls, so rate limits alone cap nothing.')}
                        checked={value.enforce}
                        onChange={next => patch({ enforce: next })}
                    />
                </ToggleGroup>

                <FieldRow
                    label={t('admin.settings.monthlyTokens', 'Tokens per user per month')}
                    desc={t('admin.settings.monthlyTokensHint', 'Owners are exempt. Queue refusals are never charged. With enforcement on, 0 is an allowance of zero rather than unlimited — turn enforcement off instead.')}
                >
                    <Input
                        type="number"
                        min={0}
                        step={100_000}
                        value={value.monthly_tokens}
                        onChange={event => patch({ monthly_tokens: Number(event.target.value) })}
                    />
                </FieldRow>
            </SectionCard>

            <SaveBar dirty={form.dirty} saving={form.saving} onDiscard={form.discard} />
        </form>
    );
}
