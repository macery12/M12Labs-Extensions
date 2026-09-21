import { useQuery } from '@tanstack/react-query';
import { Gauge, HardDrive, Layers } from 'lucide-react';
import { getAiInference } from '../../adminApi';
import { IgnoredSettings, type IgnoredSetting } from '../IgnoredSettings';
import { AI_INFERENCE_KEY, useAiCapabilities, useAiSettingsForm } from '../useAiSettingsForm';
import { AiLoadError } from '../LoadError';
import { Input, Select, Spinner, FieldGrid, FieldRow, SaveBar, SectionCard, ToggleGroup, ToggleRow, createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

function formatVram(bytes: number | undefined): string | null {
    if (!bytes) return null;

    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

// Keeping a self-hosted GPU busy without thrashing it: how long a model stays
// resident, and how many turns may run at once before the rest queue.
export default function PerformancePage() {
    const form = useAiSettingsForm(
        settings => ({
            keep_alive: settings.keep_alive || '10m',
            warm: settings.warm ?? false,
            slots: settings.concurrency?.slots ?? 0,
            per_user: settings.concurrency?.per_user ?? 1,
            queue_depth: settings.concurrency?.queue_depth ?? 20,
            max_wait_seconds: settings.concurrency?.max_wait_seconds ?? 120,
        }),
        value => ({
            keep_alive: value.keep_alive,
            warm: value.warm,
            concurrency: {
                // Zero means "derive it from the model probe", which is what a
                // null reads as on the way in.
                slots: value.slots > 0 ? value.slots : null,
                per_user: value.per_user,
                queue_depth: value.queue_depth,
                max_wait_seconds: value.max_wait_seconds,
            },
        }),
    );

    const { value, patch } = form;
    const capabilities = useAiCapabilities();

    const { data: inference } = useQuery({
        queryKey: AI_INFERENCE_KEY,
        queryFn: getAiInference,
        retry: false,
        staleTime: 60_000,
    });

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

    // A hosted provider runs on someone else's hardware: there is no residency
    // to manage and no slot to contend for. Say so rather than showing controls
    // that would be saved and ignored.
    if (!capabilities.queue && !capabilities.keepAlive) {
        return (
            <SectionCard
                icon={Gauge}
                title={t('admin.settings.queue', 'Inference queue')}
                desc={t('admin.pages.performanceDesc', 'Keeping self-hosted inference busy without thrashing it.')}
            >
                <p className="text-sm text-[var(--color-ink-muted)]">{t('admin.settings.queueHostedNote', 'Keep-alive, scheduled warm-up, and admission control apply only to inference running on your own hardware. This hosted provider does not need them; it is bounded by spend instead — see Budget & access.')}</p>
            </SectionCard>
        );
    }

    const queue = inference?.queue;
    const resident = inference?.resident_models ?? [];

    // Self-hosted but not Ollama — an OpenAI-compatible server in front of
    // llama.cpp, vLLM or Ollama's own shim. Residency is a real thing there, we
    // just have no way to ask for it: `keep_alive` is an Ollama request field
    // and anything else accepts it and drops it. The queue controls below still
    // apply, so the page renders; these two do not, so they are declared rather
    // than silently missing.
    const ignored: IgnoredSetting[] = capabilities.keepAlive
        ? []
        : [
              { label: t('admin.settings.keepAlive', 'Keep model loaded'), reason: t('admin.settings.selfHostedNotOllama', 'Ollama only — this endpoint ignores it') },
              { label: t('admin.settings.warm', 'Scheduled warm-up'), reason: t('admin.settings.selfHostedNotOllama', 'Ollama only — this endpoint ignores it') },
          ];

    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={event => {
                event.preventDefault();
                form.submit();
            }}
        >
            {capabilities.keepAlive && (
                <SectionCard
                    icon={HardDrive}
                    title={t('admin.settings.ollamaPerformance', 'Ollama performance')}
                    desc={t('admin.pages.residencyDesc', 'How long a model stays loaded. Unloading frees VRAM; reloading costs the next person a cold start.')}
                >
                    <FieldRow label={t('admin.settings.keepAlive', 'Keep model loaded')} desc={t('admin.settings.keepAliveHint', 'How long Ollama keeps the model in memory after a request. Longer = fewer cold starts, more VRAM held.')}>
                        <Select
                            value={value.keep_alive}
                            onChange={next => patch({ keep_alive: next })}
                            options={[
                                { value: '5m', label: t('admin.settings.keepAlive5m', '5 minutes') },
                                { value: '10m', label: t('admin.settings.keepAlive10m', '10 minutes') },
                                { value: '30m', label: t('admin.settings.keepAlive30m', '30 minutes') },
                                { value: '1h', label: t('admin.settings.keepAlive1h', '1 hour') },
                                { value: '4h', label: t('admin.settings.keepAlive4h', '4 hours') },
                                { value: '24h', label: t('admin.settings.keepAlive24h', '24 hours') },
                                { value: '-1', label: t('admin.settings.keepAliveForever', 'Always loaded (never unload)') },
                            ]}
                        />
                    </FieldRow>

                    <ToggleGroup>
                        <ToggleRow
                            label={t('admin.settings.warm', 'Scheduled warm-up')}
                            desc={t('admin.settings.warmHint', 'Ping Ollama every 5 minutes so the model stays loaded and nobody hits the 20–60s cold start.')}
                            checked={value.warm}
                            onChange={next => patch({ warm: next })}
                        />
                    </ToggleGroup>

                    {resident.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-[var(--color-ink-faint)]">
                                {t('admin.settings.residentModels', 'Loaded now')}
                            </span>
                            {resident.map((model, index) => {
                                const name = model.name ?? model.model ?? '—';
                                const vram = formatVram(model.size_vram);

                                return (
                                    <span
                                        key={`${name}-${index}`}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink-muted)]"
                                    >
                                        <Layers className="h-3 w-3 opacity-60" />
                                        {name}
                                        {vram && <span className="opacity-60">{vram}</span>}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </SectionCard>
            )}

            {capabilities.queue && (
                <SectionCard
                    icon={Gauge}
                    title={t('admin.settings.queue', 'Inference queue')}
                    desc={t('admin.settings.queueHint', 'A GPU serves a fixed number of requests at once. Past that, queueing keeps everyone moving instead of slowing everyone down.')}
                    right={
                        queue?.applies ? (
                            <span className="font-mono text-xs text-[var(--color-ink-faint)] tabular-nums">
                                {t('admin.settings.slotsInUse', '{used} of {total} slots in use', {
                                    used: String(queue.slots_in_use),
                                    total: String(queue.slots),
                                })}
                            </span>
                        ) : undefined
                    }
                >
                    <FieldGrid>
                        <FieldRow label={t('admin.settings.slots', 'Concurrent slots')} desc={t('admin.settings.slotsHint', '0 derives it from the model probe. Match your server\'s parallelism.')}>
                            <Input
                                type="number"
                                min={0}
                                max={64}
                                value={value.slots}
                                onChange={event => patch({ slots: Number(event.target.value) })}
                            />
                        </FieldRow>
                        <FieldRow label={t('admin.settings.perUser', 'Turns per user')} desc={t('admin.settings.perUserHint', 'Stops one person occupying every slot. 0 removes the limit.')}>
                            <Input
                                type="number"
                                min={0}
                                max={16}
                                value={value.per_user}
                                onChange={event => patch({ per_user: Number(event.target.value) })}
                            />
                        </FieldRow>
                        <FieldRow
                            label={t('admin.settings.queueDepth', 'Queue depth')}
                            desc={t('admin.settings.queueDepthHint', 'Requests are refused once this many are waiting. 0 means no queue at all: a turn that cannot start immediately is refused.')}
                        >
                            <Input
                                type="number"
                                min={0}
                                max={500}
                                value={value.queue_depth}
                                onChange={event => patch({ queue_depth: Number(event.target.value) })}
                            />
                        </FieldRow>
                        <FieldRow label={t('admin.settings.maxWait', 'Max wait (seconds)')} desc={t('admin.settings.maxWaitHint', 'How long a turn waits for a slot before giving up.')}>
                            <Input
                                type="number"
                                min={5}
                                max={600}
                                value={value.max_wait_seconds}
                                onChange={event => patch({ max_wait_seconds: Number(event.target.value) })}
                            />
                        </FieldRow>
                    </FieldGrid>
                </SectionCard>
            )}

            <IgnoredSettings items={ignored} />

            <SaveBar dirty={form.dirty} saving={form.saving} onDiscard={form.discard} />
        </form>
    );
}
