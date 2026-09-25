import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Cpu, ExternalLink, HardDrive, KeyRound, Plug, RefreshCw, Trash2, TriangleAlert, Wifi, Wrench } from 'lucide-react';
import { SettingNotice } from '../SettingNotice';
import { AiLoadError } from '../LoadError';
import {
    getAiInference,
    getAiModels,
    testAiConnection,
    testAiToolCalling,
    updateAiSettings,
    type AiConnectionTest,
    type AiProvider,
    type AiToolCallingTest,
} from '../../adminApi';
import { DEFAULT_ENDPOINTS } from '../capabilities';
import { AI_INFERENCE_KEY, AI_SETTINGS_KEY, useAiCapabilities, useAiSettingsForm } from '../useAiSettingsForm';
import { cn, Button, Input, Select, Spinner, ConfirmDialog, FieldGrid, FieldRow, SaveBar, SectionCard, notify, extensionErrorMessage, createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

const LOCAL_PROVIDER_CHOICE = 'local';

function formatSize(bytes: number | null): string | null {
    if (!bytes) return null;

    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

// Where the panel sends its inference, and what it asks for. Everything on this
// page is one decision — an endpoint, a credential, a model — which is why it
// is worth a page rather than the top third of a long form.
export default function ProviderPage() {
    const queryClient = useQueryClient();
    const [confirmKeyDelete, setConfirmKeyDelete] = useState(false);
    const [testResult, setTestResult] = useState<AiConnectionTest | null>(null);
    const [toolTestResult, setToolTestResult] = useState<AiToolCallingTest | null>(null);
    const [testing, setTesting] = useState(false);

    const form = useAiSettingsForm(
        settings => ({
            provider: settings.provider,
            endpoint: settings.endpoint || DEFAULT_ENDPOINTS[settings.provider],
            // Never returned by the API — a blank draft means "leave whatever is
            // stored alone", and only a typed value is ever sent.
            key: '',
            model: settings.model || '',
        }),
        value => ({
            provider: value.provider,
            endpoint: value.endpoint,
            model: value.model,
            ...(value.key.trim() ? { key: value.key } : {}),
        }),
    );

    const { settings, value, patch: patchDraft } = form;
    const capabilities = useAiCapabilities(value?.provider);
    const modelsKey = ['admin', 'ai', 'models'] as const;

    const {
        data: models = [],
        isFetching: modelsFetching,
        isError: modelsQueryError,
        error: modelsQueryFailure,
    } = useQuery({
        queryKey: modelsKey,
        queryFn: () => getAiModels(false),
        retry: false,
        staleTime: 300_000,
    });

    const refreshModels = useMutation({
        mutationFn: () => getAiModels(true),
        onSuccess: fresh => queryClient.setQueryData(modelsKey, fresh),
    });

    // Same key as useAiCapabilities, so this shares that request rather than
    // making a second one.
    const { data: inference } = useQuery({
        queryKey: AI_INFERENCE_KEY,
        queryFn: getAiInference,
        retry: false,
        staleTime: 60_000,
    });

    const removeKey = useMutation({
        mutationFn: () => updateAiSettings({ key: '' }),
        onSuccess: () => {
            setConfirmKeyDelete(false);
            notify('success', t('admin.settings.keyRemoved', 'The API key has been removed.'));
            void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_KEY });
        },
        onError: err => notify('error', extensionErrorMessage(err, t('common.states.genericError', 'Something went wrong. Please try again.'))),
    });

    const testTools = useMutation({
        mutationFn: testAiToolCalling,
        onSuccess: result => {
            setToolTestResult(result);
            if (result.status !== 'error') {
                void queryClient.invalidateQueries({ queryKey: AI_INFERENCE_KEY });
            }
        },
        onError: err => {
            setToolTestResult({
                status: 'error',
                message: extensionErrorMessage(err, t('common.states.genericError', 'Something went wrong. Please try again.')),
            });
        },
    });

    // A connection result belongs to the saved endpoint. Clear it as soon as
    // the draft changes so "Connected" can never describe the old provider.
    const patch = (partial: Parameters<typeof patchDraft>[0]) => {
        setTestResult(null);
        setToolTestResult(null);
        patchDraft(partial);
    };

    const runTest = async () => {
        if (form.dirty) return;

        setTesting(true);
        setTestResult(null);
        try {
            setTestResult(await testAiConnection(true));
        } catch (error) {
            setTestResult({
                status: 'error',
                message: extensionErrorMessage(error, t('common.states.genericError', 'Something went wrong. Please try again.')),
            });
        } finally {
            setTesting(false);
        }
    };

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

    // Saving a different provider discards the stored endpoint and key, so the
    // "key on file" affordances below must stop claiming one is kept.
    const providerChanged = value.provider !== settings.provider;
    const localProvider = value.provider === 'ollama' || value.provider === 'openai_compatible';
    const probeOutdated = form.dirty;
    const discovered = !probeOutdated && models.length > 0;
    const modelsRefreshing = modelsFetching || refreshModels.isPending;
    const modelsError = modelsQueryError || refreshModels.isError;
    const modelsFailure = refreshModels.error ?? modelsQueryFailure;
    const testedCapabilities = !probeOutdated
        && inference?.capabilities?.model === settings.model
        ? inference.capabilities
        : null;
    const toolTestStatus = toolTestResult?.status
        ?? (testedCapabilities?.tool_support_verified
            ? testedCapabilities.supports_tools ? 'supported' : 'unsupported'
            : null);
    const toolTestModel = toolTestResult?.model ?? testedCapabilities?.model ?? value.model;

    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={event => {
                event.preventDefault();
                form.submit();
            }}
        >
            <SectionCard
                icon={Plug}
                title={t('admin.settings.provider', 'Provider')}
                desc={t('admin.pages.providerDesc', 'Where the panel sends its inference, and what it authenticates with.')}
                right={
                    <div className="flex items-center gap-3">
                        {testResult && (
                            <span
                                className={cn(
                                    'text-xs font-medium',
                                    testResult.status === 'ok'
                                        ? 'text-[var(--color-accent)]'
                                        : 'text-[var(--color-danger)]',
                                )}
                            >
                                {testResult.status === 'ok'
                                    ? t('admin.overview.connected', 'Connected · {latency}ms', { latency: String(testResult.latency_ms ?? '?') })
                                    : testResult.message}
                            </span>
                        )}
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            title={probeOutdated ? t('admin.settings.saveBeforeProbe', 'Save connection changes before testing or refreshing models.') : undefined}
                            onClick={() => void runTest()}
                            disabled={testing || probeOutdated}
                        >
                            <Wifi className="h-3.5 w-3.5" />
                            {testing ? t('admin.settings.testing', 'Testing…') : t('admin.settings.testConnection', 'Test connection')}
                        </Button>
                    </div>
                }
            >
                <FieldGrid>
                    <FieldRow
                        label={t('admin.settings.providerLabel', 'Provider')}
                        desc={
                            localProvider
                                ? t('admin.settings.modeLocalHint', 'Connect to Ollama, llama.cpp, LM Studio, vLLM, or another local model server. An API key is optional.')
                                : value.provider === 'openrouter'
                                  ? t('admin.settings.modeOpenrouterHint', 'Uses OpenRouter\'s free-model router with enforced data-collection denial and full panel-context redaction. Requires an OpenRouter API key.')
                                  : value.provider === 'anthropic'
                                    ? t('admin.settings.modeAnthropicHint', 'Connects to the official Anthropic API. Requires an Anthropic API key and API billing.')
                                    : t('admin.settings.modeOpenaiHint', 'Connects to the official OpenAI API. Requires an API Platform key and billing; a ChatGPT or Codex subscription is not an API key.')
                        }
                    >
                        <Select
                            value={localProvider ? LOCAL_PROVIDER_CHOICE : value.provider}
                            onChange={next => {
                                const provider = next === LOCAL_PROVIDER_CHOICE
                                    ? 'ollama'
                                    : next as AiProvider;

                                // The endpoint and key are a single slot shared
                                // by every provider, not one slot each, so the
                                // previous provider's values cannot carry over:
                                // a LAN Ollama address is not a valid Anthropic
                                // endpoint, and its key would be rejected there.
                                // The backend clears the stored pair to match.
                                patch({
                                    provider,
                                    endpoint: DEFAULT_ENDPOINTS[provider],
                                    key: '',
                                    ...(provider === 'openrouter' ? { model: 'openrouter/free' } : {}),
                                });
                            }}
                            options={[
                                { value: 'openai', label: t('admin.providerOpenai', 'OpenAI API (hosted)') },
                                { value: 'anthropic', label: t('admin.providerAnthropic', 'Anthropic API (hosted)') },
                                { value: 'openrouter', label: t('admin.providerOpenrouter', 'OpenRouter Free (hosted)') },
                                { value: LOCAL_PROVIDER_CHOICE, label: t('admin.providerLocal', 'Local models (self-hosted)') },
                            ]}
                        />
                    </FieldRow>

                    {localProvider && (
                        <FieldRow
                            label={t('admin.settings.localProtocol', 'Local server API')}
                            desc={
                                value.provider === 'ollama'
                                    ? t('admin.settings.modeOllamaHint', 'Choose this only for native Ollama. The panel uses Ollama\'s /api/chat features; no API key is required.')
                                    : t('admin.settings.modeCompatibleHint', 'Choose this for llama.cpp, LM Studio, vLLM, or another local /v1 Chat Completions server. An API key is optional.')
                            }
                        >
                            <Select
                                value={value.provider}
                                onChange={next => {
                                    const provider = next as AiProvider;

                                    patch({
                                        provider,
                                        endpoint: DEFAULT_ENDPOINTS[provider],
                                        key: '',
                                    });
                                }}
                                options={[
                                    { value: 'ollama', label: t('admin.providerOllama', 'Ollama (local)') },
                                    { value: 'openai_compatible', label: t('admin.providerCompatible', 'llama.cpp / LM Studio / vLLM (local)') },
                                ]}
                            />
                        </FieldRow>
                    )}

                    <FieldRow
                        label={t('admin.settings.endpoint', 'API endpoint')}
                        desc={
                            value.provider === 'openai_compatible'
                                ? t('admin.settings.endpointCompatibleHint', 'Enter the /v1 base URL exposed by your self-hosted server.')
                                : value.provider === 'openrouter'
                                  ? t('admin.settings.endpointOpenrouterHint', 'Managed by the panel and fixed to OpenRouter\'s global API.')
                                  : capabilities.selfHosted
                                    ? t('admin.settings.endpointOllamaHint', 'Default: http://127.0.0.1:11434/v1')
                                    : t('admin.settings.endpointOpenaiHint', 'Must be HTTPS and end in /v1.')
                        }
                    >
                        <Input
                            value={value.endpoint}
                            onChange={event => patch({ endpoint: event.target.value })}
                            placeholder={DEFAULT_ENDPOINTS[value.provider] || 'https://…'}
                            readOnly={value.provider === 'openrouter'}
                        />
                    </FieldRow>

                    {!probeOutdated && capabilities.shimmedOllama && (
                        <SettingNotice title={t('admin.settings.shimWarnTitle', 'This endpoint looks like Ollama')}>
                            {t('admin.settings.shimWarnBody', 'Ollama’s OpenAI-compatible API accepts context window and keep-alive settings and then ignores them. Choose the Ollama provider instead to have them honoured.')}
                        </SettingNotice>
                    )}

                    {capabilities.apiKey ? (
                        <FieldRow
                            label={
                                capabilities.apiKeyOptional
                                    ? t('admin.settings.apiKeyOptional', 'API key (optional)')
                                    : t('admin.settings.apiKey', 'API key')
                            }
                        >
                            <div className="flex items-center gap-2">
                                <Input
                                    type="password"
                                    value={value.key}
                                    onChange={event => patch({ key: event.target.value })}
                                    placeholder={
                                        settings.key && !providerChanged ? t('admin.settings.keyKept', '•••••••• (leave blank to keep current)') : 'sk-…'
                                    }
                                    autoComplete="new-password"
                                />
                                {settings.key && !providerChanged && (
                                    <Button
                                        type="button"
                                        variant="danger"
                                        size="icon"
                                        title={t('admin.settings.removeKey', 'Remove saved key')}
                                        onClick={() => setConfirmKeyDelete(true)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                            {value.provider === 'openrouter' && (
                                <a
                                    href="https://openrouter.ai/settings/keys"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline"
                                >
                                    {t('admin.settings.openrouterManageKeys', 'Manage OpenRouter API keys')}
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            )}
                        </FieldRow>
                    ) : (
                        <FieldRow label={t('admin.settings.apiKey', 'API key')}>
                            <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-3 py-2.5 text-xs text-[var(--color-ink-faint)]">
                                {t('admin.settings.noKeyNeeded', 'Ollama doesn\'t need an API key — leave this section empty.')}
                            </p>
                        </FieldRow>
                    )}
                </FieldGrid>

                {providerChanged && (
                    <div className="flex gap-2 rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-2.5">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
                        <p className="text-xs text-[var(--color-ink-muted)]">
                            {t('admin.settings.providerSwitch', 'Switching away from {provider} resets the endpoint and clears the saved API key — both belong to the previous provider. Enter this provider\'s key before saving, or the connection will fail.', { provider: settings.provider })}
                        </p>
                    </div>
                )}
            </SectionCard>

            <SectionCard icon={Cpu} title={t('admin.settings.model', 'Model')} desc={t('admin.pages.modelDesc', 'The model everything runs on, and the two places that can override it.')}>
                <FieldRow
                    label={t('admin.settings.model', 'Model')}
                    desc={
                        value.provider === 'openrouter'
                            ? t('admin.settings.modelOpenrouterHint', 'Fixed to openrouter/free. OpenRouter automatically chooses a compatible free model, which may change between requests or agent steps.')
                            : !discovered
                            ? capabilities.presets.length > 0
                                ? t('admin.settings.modelPresetHint', 'Suggestions only. Verify a model is available from your provider, then type its name above.')
                                : t('admin.settings.modelExactHint', 'Enter the exact model ID exposed by your server.')
                            : capabilities.selfHosted
                              ? t('admin.settings.modelDiscoveredHint', 'Pick an installed model below or type a name.')
                              : t('admin.settings.modelAvailableHint', 'Pick an available model below or type a name.')
                    }
                >
                    <div className="flex items-center gap-2">
                        <Input
                            value={value.model}
                            onChange={event => patch({ model: event.target.value })}
                            className="font-mono"
                            readOnly={value.provider === 'openrouter'}
                        />
                        {value.provider !== 'openrouter' && <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title={
                                probeOutdated
                                    ? t('admin.settings.saveBeforeProbe', 'Save connection changes before testing or refreshing models.')
                                    : t('admin.settings.refreshModels', 'Refresh installed models')
                            }
                            onClick={() => refreshModels.mutate()}
                            disabled={modelsRefreshing || probeOutdated}
                        >
                            <RefreshCw className={cn('h-4 w-4', modelsRefreshing && 'animate-spin')} />
                        </Button>}
                    </div>
                </FieldRow>

                {value.provider !== 'openrouter' && <div className="flex flex-wrap gap-1.5">
                    {discovered
                        ? models.map(model => {
                            const size = formatSize(model.size);

                            return (
                                <button
                                    key={model.id}
                                    type="button"
                                    onClick={() => patch({ model: model.id })}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs transition-colors',
                                        value.model === model.id
                                            ? 'border-[var(--brand)]/60 bg-[var(--brand-soft)] text-[var(--brand)]'
                                            : 'border-[var(--color-border-strong)] text-[var(--color-ink-muted)] hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink)]',
                                    )}
                                >
                                    {/* A disk icon only means something for a model that
                                        occupies disk here; a hosted model has no local
                                        footprint and no size to report. */}
                                    {capabilities.selfHosted && <HardDrive className="h-3 w-3 opacity-60" />}
                                    {model.id}
                                    {size && <span className="opacity-60">{size}</span>}
                                </button>
                            );
                        })
                        : capabilities.presets.map(id => (
                            <span
                                key={id}
                                className="inline-flex items-center rounded-full border border-dashed border-[var(--color-border-strong)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink-faint)]"
                            >
                                {id}
                            </span>
                        ))}
                </div>}

                {value.provider === 'openrouter' && (
                    <SettingNotice title={t('admin.settings.openrouterFreeTitle', 'Free-router availability')}>
                        {t('admin.settings.openrouterFreeBody', 'Free models have lower rate limits and fluctuating availability. OpenRouter currently documents 50 free requests per day without qualifying purchased credits and 1,000 per day after purchasing at least $10 in credits.')}
                    </SettingNotice>
                )}

                {value.provider !== 'openrouter' && modelsError && !probeOutdated && (
                    <p className="text-xs text-[var(--color-warning)]">
                        {extensionErrorMessage(modelsFailure, t('admin.settings.modelsUnavailable', 'Couldn\'t list models from the endpoint — check the connection, then refresh.'))}
                    </p>
                )}

                {value.provider === 'openai_compatible' && (
                    <div
                        className={cn(
                            'flex min-w-0 flex-col gap-2 rounded-md border p-2.5 sm:flex-row sm:items-center sm:justify-between',
                            toolTestStatus === 'supported'
                                ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10'
                                : toolTestStatus === 'error'
                                  ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10'
                                  : 'border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10',
                        )}
                    >
                        <div className="flex min-w-0 gap-2">
                            {toolTestStatus === 'supported' ? (
                                <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                            ) : (
                                <TriangleAlert
                                    className={cn(
                                        'mt-0.5 h-3.5 w-3.5 shrink-0',
                                        toolTestStatus === 'error'
                                            ? 'text-[var(--color-danger)]'
                                            : 'text-[var(--color-warning)]',
                                    )}
                                />
                            )}
                            <p className="min-w-0 break-words text-xs text-[var(--color-ink-muted)]">
                                {probeOutdated
                                    ? t('admin.settings.saveBeforeToolProbe', 'Save the provider, endpoint, and model before testing tool calling.')
                                    : toolTestStatus === 'supported'
                                      ? t('admin.settings.toolCallingVerified', 'Tool calling is verified for {model}.', { model: toolTestModel })
                                      : toolTestStatus === 'unsupported'
                                        ? t('admin.settings.toolCallingUnsupported', 'The live test did not get the required tool call from {model}. The agent is blocked for this model.', { model: toolTestModel })
                                        : toolTestStatus === 'error'
                                          ? toolTestResult?.message ?? t('common.states.genericError', 'Something went wrong. Please try again.')
                                          : t('admin.settings.toolCallingUnverified', 'Tool calling has not been tested for this model. The test makes one small inference request and may load the model.')}
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="shrink-0 self-start sm:self-auto"
                            title={probeOutdated ? t('admin.settings.saveBeforeToolProbe', 'Save the provider, endpoint, and model before testing tool calling.') : undefined}
                            onClick={() => testTools.mutate()}
                            disabled={testTools.isPending || probeOutdated || value.model.trim() === ''}
                        >
                            <Wrench className="h-3.5 w-3.5" />
                            {testTools.isPending
                                ? t('admin.settings.testingToolCalling', 'Testing tool calling…')
                                : t('admin.settings.testToolCalling', 'Test tool calling')}
                        </Button>
                    </div>
                )}

                {/* A failed model-level probe blocks the agent. Native
                    providers report that state without needing live inference. */}
                {value.provider !== 'openai_compatible'
                    && !probeOutdated
                    && inference?.capabilities
                    && (inference.capabilities.supports_tools === false || inference.capabilities.warnings.length > 0) && (
                    <div className="flex min-w-0 gap-2 rounded-md border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-2.5">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
                        <p className="min-w-0 break-words text-xs text-[var(--color-ink-muted)]">
                            {inference.capabilities.warnings[0] ?? t('admin.settings.noToolSupport', 'This model does not report tool-calling support, so the agent cannot run on it.')}
                        </p>
                    </div>
                )}
            </SectionCard>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-ink-faint)]">
                <KeyRound className="h-3.5 w-3.5 shrink-0" />
                <span>{t('admin.settings.footerNote', 'The API key is stored encrypted and never sent back to the browser.')}</span>
                <span>{t('admin.settings.effectNote', 'Changes take effect on the next request after saving.')}</span>
            </div>

            <SaveBar dirty={form.dirty} saving={form.saving} onDiscard={form.discard} />

            <ConfirmDialog
                open={confirmKeyDelete}
                onClose={() => setConfirmKeyDelete(false)}
                title={t('admin.settings.removeKeyTitle', 'Remove the saved API key?')}
                body={t('admin.settings.removeKeyBody', 'AI requests will fail until a new key is saved.')}
                confirmLabel={t('common.actions.remove', 'Remove')}
                cancelLabel={t('common.actions.cancel', 'Cancel')}
                busy={removeKey.isPending}
                onConfirm={() => removeKey.mutate()}
            />
        </form>
    );
}
