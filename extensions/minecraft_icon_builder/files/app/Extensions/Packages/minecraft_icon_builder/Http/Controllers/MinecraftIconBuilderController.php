<?php

namespace Everest\Extensions\Packages\minecraft_icon_builder\Http\Controllers;

use Everest\Models\Server;
use Illuminate\Support\Str;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Everest\Exceptions\DisplayException;
use Everest\Repositories\Wings\DaemonFileRepository;
use Everest\Traits\Controllers\RespondsWithExtensionEnvelope;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Extensions\Packages\minecraft_icon_builder\Http\Requests\GetIconRequest;
use Everest\Extensions\Packages\minecraft_icon_builder\Http\Requests\SaveIconRequest;

/**
 * Reads and writes a server's server-icon.png.
 *
 * Mounted by the loader under
 * /api/client/servers/{server}/extensions/ext/minecraft_icon_builder, with the
 * server binding, client auth and the extensions.access gate applied there. The
 * package's route file declares no prefix and no middleware of its own.
 *
 * Both directions treat the file as untrusted. Inbound, the icon is decoded
 * strictly and must be a PNG of exactly the dimensions Minecraft accepts before
 * a single byte reaches Wings. Outbound, the existing file is read under a size
 * bound: server-icon.png is whatever the server's own filesystem holds, and a
 * caller who replaced it with a large file must not be able to turn a panel
 * read into unbounded memory growth.
 */
class MinecraftIconBuilderController extends ClientApiController
{
    use RespondsWithExtensionEnvelope;

    /** Minecraft renders the server icon at exactly 64x64. */
    private const ICON_DIMENSION = 64;

    /**
     * Ceiling on the decoded image, and on the existing file read back.
     *
     * A legitimate 64x64 PNG is a few kilobytes; 256 KiB leaves room for an
     * inefficient encoder without letting the endpoint stream an arbitrary file
     * into memory.
     */
    private const MAX_ICON_BYTES = 262144;

    public function __construct(
        private DaemonFileRepository $fileRepository,
    ) {
        parent::__construct();
    }

    public function index(GetIconRequest $request, Server $server): JsonResponse
    {
        try {
            // Bounded read: FileSizeTooLargeException is thrown before the body
            // is materialised, so an oversized file costs nothing to refuse.
            $content = $this->fileRepository
                ->setServer($server)
                ->getContent('server-icon.png', self::MAX_ICON_BYTES);
        } catch (\Throwable) {
            // A missing icon is the common case and is not an error. An
            // oversized or unreadable one is reported the same way rather than
            // disclosing which it was.
            return $this->extensionItemResponse('minecraft_icon_builder_icon', [
                'has_icon' => false,
                'image_base64' => null,
            ]);
        }

        // Wings does not honour a Content-Length bound on every transport, so
        // the decoded length is checked here too rather than trusted.
        if ($content === '' || strlen($content) > self::MAX_ICON_BYTES) {
            return $this->extensionItemResponse('minecraft_icon_builder_icon', [
                'has_icon' => false,
                'image_base64' => null,
            ]);
        }

        return $this->extensionItemResponse('minecraft_icon_builder_icon', [
            'has_icon' => true,
            'image_base64' => 'data:image/png;base64,' . base64_encode($content),
        ]);
    }

    public function saveIcon(SaveIconRequest $request, Server $server): JsonResponse
    {
        $bytes = $this->decodeIcon((string) $request->input('image_base64'));

        try {
            $this->fileRepository->setServer($server)->putContent('server-icon.png', $bytes);
        } catch (\Throwable $exception) {
            // The daemon's own message can carry paths, upstream response
            // bodies and connection detail. The caller gets a stable sentence
            // and a correlation id; the detail stays in the panel's log.
            $correlationId = (string) Str::uuid();

            Log::error('minecraft_icon_builder: failed to write server-icon.png', [
                'correlation_id' => $correlationId,
                'server_id' => $server->id,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);

            throw new DisplayException(sprintf('The server icon could not be saved. Reference: %s', $correlationId));
        }

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }

    /**
     * Strict decode and validation of the submitted data URI.
     *
     * @throws DisplayException
     */
    private function decodeIcon(string $dataUri): string
    {
        $base64 = preg_replace('#^data:image/png;base64,#', '', $dataUri);

        // Strict mode: base64_decode returns false on any character outside the
        // alphabet. The previous code passed that false straight into
        // imagecreatefromstring, where it decayed to an empty string and the
        // failure surfaced as "invalid PNG" instead of "invalid encoding".
        $bytes = base64_decode((string) $base64, true);
        if ($bytes === false || $bytes === '') {
            throw new DisplayException('The icon is not valid base64 data.');
        }

        if (strlen($bytes) > self::MAX_ICON_BYTES) {
            throw new DisplayException(sprintf('The icon must be %d KiB or smaller.', self::MAX_ICON_BYTES / 1024));
        }

        // getimagesizefromstring parses only the header, so the type and
        // dimensions are known before a full decode is attempted.
        $info = @getimagesizefromstring($bytes);
        if ($info === false || ($info[2] ?? null) !== IMAGETYPE_PNG) {
            throw new DisplayException('The icon must be a PNG image.');
        }

        // The request-size cap alone accepted any parseable PNG. Minecraft
        // reads server-icon.png at exactly 64x64 and ignores anything else, so
        // the panel refuses it here rather than writing a file the game drops.
        if ((int) $info[0] !== self::ICON_DIMENSION || (int) $info[1] !== self::ICON_DIMENSION) {
            throw new DisplayException(sprintf('The icon must be exactly %1$dx%1$d pixels.', self::ICON_DIMENSION));
        }

        // Header-only parsing does not prove the pixel data decodes, so the
        // image is fully decoded once and discarded before it is written.
        $image = @imagecreatefromstring($bytes);
        if ($image === false) {
            throw new DisplayException('The icon could not be decoded as a PNG image.');
        }
        imagedestroy($image);

        return $bytes;
    }
}
