<?php

namespace Everest\Extensions\Packages\minecraft_icon_builder\Http\Controllers;

use Everest\Models\Server;
use Illuminate\Http\JsonResponse;
use Everest\Repositories\Wings\DaemonFileRepository;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Extensions\Packages\minecraft_icon_builder\Http\Requests\GetIconRequest;
use Everest\Extensions\Packages\minecraft_icon_builder\Http\Requests\SaveIconRequest;

class MinecraftIconBuilderController extends ClientApiController
{
    public function __construct(
        private DaemonFileRepository $fileRepository,
    ) {
        parent::__construct();
    }

    public function index(GetIconRequest $request, Server $server): JsonResponse
    {
        try {
            $content = $this->fileRepository->setServer($server)->getContent('server-icon.png');

            return new JsonResponse([
                'object' => 'extension_minecraft_icon_builder',
                'attributes' => [
                    'has_icon' => true,
                    'image_base64' => 'data:image/png;base64,' . base64_encode($content),
                ],
            ]);
        } catch (\Throwable) {
            return new JsonResponse([
                'object' => 'extension_minecraft_icon_builder',
                'attributes' => [
                    'has_icon' => false,
                    'image_base64' => null,
                ],
            ]);
        }
    }

    public function saveIcon(SaveIconRequest $request, Server $server): JsonResponse
    {
        $dataUri = $request->input('image_base64');
        $base64 = preg_replace('#^data:image/png;base64,#', '', $dataUri);
        $bytes = base64_decode($base64, true);

        $img = @imagecreatefromstring($bytes);
        if ($img === false) {
            return new JsonResponse(['error' => 'Invalid PNG data.'], 422);
        }
        imagedestroy($img);

        try {
            $this->fileRepository->setServer($server)->putContent('server-icon.png', $bytes);
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => $e->getMessage()], 500);
        }

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }
}
