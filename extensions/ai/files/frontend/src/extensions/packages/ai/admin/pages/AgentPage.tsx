import { Bot, Layers, Timer } from 'lucide-react';
import { IgnoredSettings, type IgnoredSetting } from '../IgnoredSettings';
import { useAiCapabilities, useAiSettingsForm } from '../useAiSettingsForm';
import { AiLoadError } from '../LoadError';
import { Input, Switch, Spinner, FieldGrid, FieldRow, SaveBar, SectionCard, ToggleGroup, ToggleRow, createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

// The agent: which assistants exist, and how far a single turn may run.
export default function AgentPage() {
    const form = useAiSettingsForm(
        settings => ({
            enabled: settings.agent?.enabled ?? false,
            admin_enabled: settings.agent?.admin_enabled ?? false,
            reasoning: settings.agent?.reasoning ?? true,
            max_steps: settings.agent?.max_steps ?? 12,
            max_wall_seconds: settings.agent?.max_wall_seconds ?? 180,
            max_tool_seconds: settings.agent?.max_tool_seconds ?? 90,
            tool_result_bytes: settings.agent?.tool_result_bytes ?? 12288,
            max_repairs: settings.agent?.max_repairs ?? 2,
            // Null is meaningful here — it is "auto" — so it must not be
            // coalesced to a number the operator never chose.
            max_tools: settings.agent?.max_tools ?? null,
            max_batch_calls: settings.agent?.max_batch_calls ?? 25,
            allow_destructive_batches: settings.agent?.allow_destructive_batches ?? false,
        }),
        value => ({ agent: value }),
    );

    const { value, patch } = form;
    const capabilities = useAiCapabilities();
    const budget = form.settings?.agent?.tool_budget;

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

    const ignored: IgnoredSetting[] = [];

    if (!capabilities.reasoning) {
        ignored.push({
            label: t('admin.settings.agentReasoning', 'Show the model thinking'),
            reason: t('admin.settings.reasoningInert', 'this provider cannot request it'),
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
            <SectionCard icon={Bot} title={t('admin.settings.agent', 'Agent')} desc={t('admin.pages.agentDesc', 'Which assistants exist. Each is gated separately — turning on chat must not hand anything the ability to act.')}>
                <ToggleGroup>
                    <ToggleRow
                        label={t('admin.settings.agentEnabled', 'Enable the agent')}
                        desc={t('admin.settings.agentEnabledHint', 'Lets users ask the assistant to act on their servers, within their own permissions.')}
                        checked={value.enabled}
                        onChange={next => patch({ enabled: next })}
                    />
                    <ToggleRow
                        label={t('admin.settings.adminAgentEnabled', 'Admin assistant')}
                        desc={t('admin.settings.adminAgentEnabledHint', 'Lets the assistant read and edit the panel itself — customers, servers, products and coupons — limited to what your own admin role allows. Off by default.')}
                        checked={value.admin_enabled}
                        onChange={next => patch({ admin_enabled: next })}
                        disabled={!value.enabled}
                    />
                    <ToggleRow
                        label={t('admin.settings.agentReasoning', 'Show the model thinking')}
                        desc={t('admin.settings.agentReasoningHint', 'Ask the model to reason before it acts, and show that reasoning in the transcript. Improves tool choice on long tasks; costs extra output tokens and a little latency. Models without a reasoning mode ignore it.')}
                        checked={value.reasoning}
                        onChange={next => patch({ reasoning: next })}
                        disabled={!value.enabled || !capabilities.reasoning}
                    />
                </ToggleGroup>

                <IgnoredSettings items={ignored} />
            </SectionCard>

            <SectionCard icon={Timer} title={t('admin.settings.turnLimits', 'Turn limits')} desc={t('admin.pages.turnLimitsDesc', 'A turn is bounded three ways, because any one of them alone can be escaped: a model can loop cheaply, stall expensively, or both.')}>
                <FieldGrid>
                    <FieldRow label={t('admin.settings.maxSteps', 'Max steps per turn')} desc={t('admin.settings.maxStepsHint', 'How many tool calls one request may chain.')}>
                        <Input
                            type="number"
                            min={1}
                            max={50}
                            value={value.max_steps}
                            onChange={event => patch({ max_steps: Number(event.target.value) })}
                        />
                    </FieldRow>
                    {/* 30 and 900 are AgentRunner::MIN_WALL_SECONDS / MAX_WALL_SECONDS; the
                        request validates the same pair. A lower bound here than the runtime
                        clamps to is a value the operator can save and never get. */}
                    <FieldRow label={t('admin.settings.maxWall', 'Max seconds per turn')} desc={t('admin.settings.maxWallHint', 'A turn is abandoned once it runs this long. Between 30 and 900 seconds; the browser waits this long plus a margin before treating a silent turn as lost.')}>
                        <Input
                            type="number"
                            min={30}
                            max={900}
                            value={value.max_wall_seconds}
                            onChange={event => patch({ max_wall_seconds: Number(event.target.value) })}
                        />
                    </FieldRow>
                    <FieldRow
                        label={t('admin.settings.maxToolSeconds', 'Max seconds per tool call')}
                        desc={t('admin.settings.maxToolSecondsHint', 'The turn limit above is only checked between steps, so this is what stops one stuck call. An overrun fails as a tool, not as the turn.')}
                    >
                        <Input
                            type="number"
                            min={5}
                            max={900}
                            value={value.max_tool_seconds}
                            onChange={event => patch({ max_tool_seconds: Number(event.target.value) })}
                        />
                    </FieldRow>
                    <FieldRow
                        label={t('admin.settings.maxTools', 'Tools offered at once')}
                        desc={
                            value.max_tools === null && budget
                                ? t('admin.settings.maxToolsAutoHint', 'Auto: {profile}, {schemas} capability tools ({total} including core). {reason} Detection confidence: {confidence}. Turn off Auto to set it yourself.', {
                                      profile: t(`admin.settings.profile.${budget.profile}`, budget.profile),
                                      schemas: String(budget.schemas),
                                      total: String(budget.total_schemas),
                                      confidence: t(
                                          `admin.settings.confidence.${budget.confidence}`,
                                          budget.confidence,
                                      ),
                                      reason: budget.reason,
                                  })
                                : t('admin.settings.maxToolsHint', 'How many tool schemas the model chooses between each step. The rest stay reachable through search — lower this if the model keeps picking the wrong tool.')
                        }
                    >
                        <div className="flex items-center gap-3">
                            <Switch
                                label={t('admin.settings.maxToolsAuto', 'Auto')}
                                checked={value.max_tools === null}
                                // Switching back to manual seeds the field with
                                // whatever auto had settled on, so the operator
                                // adjusts from the working value rather than from
                                // a number nothing chose.
                                onChange={auto => patch({ max_tools: auto ? null : (budget?.schemas ?? 12) })}
                            />
                            {value.max_tools !== null && (
                                <Input
                                    type="number"
                                    min={4}
                                    max={64}
                                    className="w-24"
                                    value={value.max_tools}
                                    onChange={event => patch({ max_tools: Number(event.target.value) })}
                                />
                            )}
                        </div>
                    </FieldRow>
                    <FieldRow
                        label={t('admin.settings.toolResultBytes', 'Tool result limit (bytes)')}
                        desc={t('admin.settings.toolResultBytesHint', 'Longer results are truncated before the model reads them.')}
                    >
                        <Input
                            type="number"
                            min={1024}
                            max={131072}
                            step={1024}
                            value={value.tool_result_bytes}
                            onChange={event => patch({ tool_result_bytes: Number(event.target.value) })}
                        />
                    </FieldRow>
                    <FieldRow label={t('admin.settings.maxRepairs', 'Repair attempts')} desc={t('admin.settings.maxRepairsHint', 'When the model writes a malformed tool call, how many times to ask again under a strict schema. Each one is a second inference over the whole transcript; 0 turns repairs off.')}>
                        <Input
                            type="number"
                            min={0}
                            max={5}
                            value={value.max_repairs}
                            onChange={event => patch({ max_repairs: Number(event.target.value) })}
                        />
                    </FieldRow>
                </FieldGrid>
            </SectionCard>

            <SectionCard
                icon={Layers}
                title={t('admin.settings.batching', 'Batching')}
                desc={t('admin.settings.batchingDesc', 'Several changes reviewed and approved as one set, instead of one card each.')}
            >
                <FieldGrid>
                    <FieldRow
                        label={t('admin.settings.maxBatchCalls', 'Max calls per batch')}
                        desc={t('admin.settings.maxBatchCallsHint', 'How many changes the model may put in one approval. Every call is written in a single response, so lower it alongside the tool limit for a small model.')}
                    >
                        <Input
                            type="number"
                            min={2}
                            max={100}
                            value={value.max_batch_calls}
                            onChange={event => patch({ max_batch_calls: Number(event.target.value) })}
                        />
                    </FieldRow>
                </FieldGrid>

                <ToggleGroup>
                    <ToggleRow
                        label={t('admin.settings.allowDestructiveBatches', 'Allow destructive calls in a batch')}
                        desc={t('admin.settings.allowDestructiveBatchesHint', 'Off means a batch containing one is refused and the model must ask for it on its own. The card still names every target and still asks for the typed confirmation once.')}
                        checked={value.allow_destructive_batches}
                        onChange={next => patch({ allow_destructive_batches: next })}
                        disabled={!value.enabled}
                    />
                </ToggleGroup>
            </SectionCard>

            <SaveBar dirty={form.dirty} saving={form.saving} onDiscard={form.discard} />
        </form>
    );
}
