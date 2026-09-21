<?php

namespace Everest\Extensions\Packages\ai\Contracts;

use Everest\Extensions\Packages\ai\Data\AiRequest;
use Everest\Extensions\Packages\ai\Data\AiResponse;
use Everest\Extensions\Packages\ai\Data\AiStreamEvent;
use Everest\Extensions\Packages\ai\Data\ProviderConfig;
use Everest\Extensions\Packages\ai\Data\ProviderCapabilities;

interface AiProvider
{
    /**
     * Perform a single non-streamed inference call.
     *
     * @throws \Everest\Extensions\Packages\ai\Exceptions\AIServiceException
     */
    public function chat(AiRequest $request): AiResponse;

    /**
     * Stream an inference call.
     *
     * Implementations must yield AiStreamEvent instances and must assemble
     * fragmented tool-call arguments internally, emitting TYPE_TOOL_CALL only
     * once a call's argument JSON is complete.
     *
     * @return \Generator<int, AiStreamEvent>
     *
     * @throws \Everest\Extensions\Packages\ai\Exceptions\AIServiceException
     */
    public function stream(AiRequest $request): \Generator;

    /**
     * What this provider and the configured model can do.
     *
     * Must never throw: an unreachable endpoint returns capabilities with
     * supportsTools = false and an explanatory warning, so the admin UI can
     * render the problem instead of erroring out.
     */
    public function capabilities(?string $model = null): ProviderCapabilities;

    /**
     * Models available on this endpoint.
     *
     * @return array<int, array{id: string, size: int|null}>
     *
     * @throws \Everest\Extensions\Packages\ai\Exceptions\AIServiceException
     */
    public function listModels(): array;

    /**
     * Cheap reachability probe. Must not trigger a model load.
     */
    public function health(): bool;

    public function config(): ProviderConfig;
}
