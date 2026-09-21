import { MessageSquareText, SlidersHorizontal } from 'lucide-react';
import { SliderField, cn, Input, Textarea, Spinner, FieldRow, SaveBar, SectionCard, createTranslator } from '@/extensions-sdk';
import { IgnoredSettings, type IgnoredSetting } from '../IgnoredSettings';
import { SettingNotice } from '../SettingNotice';
import { useAiCapabilities, useAiSettingsForm } from '../useAiSettingsForm';
import { AiLoadError } from '../LoadError';

const t = createTranslator('ai');

const MAX_PROMPT = 1000;

const TEMP_STOPS: { at: number; label: () => string; hint: () => string }[] = [
    { at: 0.0, label: () => t('admin.settings.tempDeterministic', 'Deterministic'), hint: () => t('admin.settings.tempDeterministicHint', 'Exact, repeatable answers.') },
    { at: 0.3, label: () => t('admin.settings.tempFocused', 'Focused'), hint: () => t('admin.settings.tempFocusedHint', 'Mostly factual with slight variation. Recommended.') },
    { at: 0.7, label: () => t('admin.settings.tempBalanced', 'Balanced'), hint: () => t('admin.settings.tempBalancedHint', 'More varied responses, still coherent.') },
    { at: 1.0, label: () => t('admin.settings.tempCreative', 'Creative'), hint: () => t('admin.settings.tempCreativeHint', 'Highly varied. Good for brainstorming, not debugging.') },
];

// What the model is asked for, and how much room it is given to answer.
export default function GenerationPage() {
    const form = useAiSettingsForm(
        settings => ({
            max_tokens: settings.max_tokens ?? 1024,
            temperature: settings.temperature ?? 0.3,
            // Zero means "let the model decide", which is what a null reads as.
            context_tokens: settings.context_tokens ?? 0,
            system_prompt: settings.system_prompt || '',
        }),
        value => ({
            max_tokens: value.max_tokens,
            temperature: value.temperature,
            // Sent as null rather than 0 so the backend reads it as "unset" and
            // falls back to the model's own reported window.
            context_tokens: value.context_tokens > 0 ? value.context_tokens : null,
            system_prompt: value.system_prompt,
        }),
    );

    const { value, patch } = form;
    const capabilities = useAiCapabilities();

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

    const temperature = value.temperature;
    const tempInfo = TEMP_STOPS.reduce((a, b) =>
        Math.abs(b.at - temperature) < Math.abs(a.at - temperature) ? b : a,
    );

    const ignored: IgnoredSetting[] = [];

    if (capabilities.temperature === 'rejected') {
        ignored.push({
            label: t('admin.settings.temperature', 'Temperature'),
            reason: capabilities.probedModel
                ? t('admin.settings.tempRejectedBy', 'Rejected by {model}', { model: capabilities.probedModel })
                : t('admin.settings.tempRejected', 'Rejected by this model'),
        });
    }

    if (!capabilities.contextWindow) {
        ignored.push({
            label: t('admin.settings.contextTokens', 'Context ceiling (tokens)'),
            reason: t('admin.settings.ollamaOnly', 'Ollama only'),
        });
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
                icon={SlidersHorizontal}
                title={t('admin.settings.modelPerformance', 'Model & performance')}
                desc={t('admin.pages.generationDesc', 'How much the model may produce, and how much freedom it has doing it.')}
            >
                <SliderField
                    label={t('admin.settings.maxTokens', 'Max response tokens')}
                    displayValue={String(value.max_tokens)}
                    min={50}
                    max={4000}
                    step={50}
                    value={value.max_tokens}
                    onChange={next => patch({ max_tokens: next })}
                    lowLabel={t('admin.settings.maxTokensLow', '50 · brief')}
                    highLabel={t('admin.settings.maxTokensHigh', '4000 · detailed')}
                />

                {capabilities.temperature !== 'rejected' && (
                    <div>
                        <SliderField
                            label={t('admin.settings.temperature', 'Temperature')}
                            displayValue={value.temperature.toFixed(2)}
                            min={0}
                            max={1}
                            step={0.05}
                            value={value.temperature}
                            onChange={next => patch({ temperature: next })}
                            lowLabel={t('admin.settings.tempDeterministic', 'Deterministic')}
                            highLabel={t('admin.settings.tempCreative', 'Creative')}
                        />
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span className="rounded bg-[var(--brand-soft)] px-2 py-0.5 text-xs font-medium text-[var(--brand)]">
                                {tempInfo.label()}
                            </span>
                            <span className="text-xs text-[var(--color-ink-faint)]">{tempInfo.hint()}</span>
                        </div>
                        {/* Tool selection is pinned to 0 regardless, so an agent
                            turn never sees this. Said here rather than left to be
                            discovered by a setting that appears to do nothing. */}
                        {capabilities.temperature === 'agent-pinned' && (
                            <p className="mt-1.5 text-xs text-[var(--color-ink-faint)]">
                                {t('admin.settings.tempAgentPinned', 'Agent turns pin this to 0 while tools are on the table, so tool selection stays repeatable.')}
                            </p>
                        )}
                    </div>
                )}

                {capabilities.contextWindow && (
                    <FieldRow
                        label={t('admin.settings.contextTokens', 'Context ceiling (tokens)')}
                        desc={t('admin.settings.contextTokensHint', '0 uses the model\'s own window. Context is paid for in VRAM.')}
                    >
                        <Input
                            type="number"
                            min={0}
                            step={1024}
                            value={value.context_tokens}
                            onChange={event => patch({ context_tokens: Number(event.target.value) })}
                        />
                    </FieldRow>
                )}

                {capabilities.unboundedContext && (
                    <SettingNotice title={t('admin.settings.contextUnboundTitle', 'No context limit set')}>
                        {t('admin.settings.contextUnboundBody', 'This model reports a {tokens}-token window and will be loaded at its full size. That is usually more VRAM than the model weights themselves. Set a limit unless you need the whole window.', {
                            tokens: (capabilities.probedContextTokens ?? 0).toLocaleString(),
                        })}
                    </SettingNotice>
                )}

                <IgnoredSettings items={ignored} />
            </SectionCard>

            <SectionCard
                icon={MessageSquareText}
                title={t('admin.settings.systemPrompt', 'System prompt')}
                desc={t('admin.settings.systemPromptHint', 'Sent with every request to define the AI\'s role and tone. Keep it concise — it counts toward the token budget.')}
                right={
                    <span
                        className={cn(
                            'text-xs tabular-nums',
                            value.system_prompt.length > MAX_PROMPT
                                ? 'text-[var(--color-danger)]'
                                : 'text-[var(--color-ink-faint)]',
                        )}
                    >
                        {value.system_prompt.length} / {MAX_PROMPT}
                    </span>
                }
            >
                <Textarea
                    rows={6}
                    value={value.system_prompt}
                    onChange={event => patch({ system_prompt: event.target.value })}
                />
            </SectionCard>

            <SaveBar
                dirty={form.dirty}
                saving={form.saving}
                onDiscard={form.discard}
                blockedReason={
                    value.system_prompt.length > MAX_PROMPT ? t('admin.settings.promptTooLong', 'The system prompt is over the length limit.') : null
                }
            />
        </form>
    );
}
