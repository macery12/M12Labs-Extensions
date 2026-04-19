import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const GRID_SIZE = 64;
const CELL_SIZE = 7; // 64 * 7 = 448px display size

const MINECRAFT_PALETTE = [
    '#FFFFFF', '#999999', '#4C4C4C', '#191919',
    '#FF4040', '#FF9933', '#FFFF33', '#66FF33',
    '#33FFFF', '#3399FF', '#9933FF', '#FF33CC',
    '#CC8833', '#4CAF50', '#1565C0', '#6D4C41',
];

export interface PixelEditorHandle {
    getImageDataUrl: () => string;
    loadFromDataUrl: (dataUrl: string) => void;
    clear: () => void;
}

interface Props {
    disabled?: boolean;
}

const PixelEditor = forwardRef<PixelEditorHandle, Props>(({ disabled = false }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [selectedColor, setSelectedColor] = useState('#4CAF50');
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState<'paint' | 'erase' | 'fill'>('paint');

    // Initialize canvas with white background
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE);
    }, []);

    const getCellFromEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = Math.floor(((e.clientX - rect.left) * scaleX) / CELL_SIZE);
        const y = Math.floor(((e.clientY - rect.top) * scaleY) / CELL_SIZE);
        if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return null;
        return { x, y };
    };

    const paintCell = (x: number, y: number, color: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = color;
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    };

    const floodFill = (startX: number, startY: number, fillColor: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const getPixel = (px: number, py: number) => {
            const index = (py * canvas.width + px) * 4;
            return [data[index], data[index + 1], data[index + 2], data[index + 3]];
        };

        const targetPixel = getPixel(startX * CELL_SIZE + 1, startY * CELL_SIZE + 1);
        const fillRgb = parseInt(fillColor.slice(1), 16);
        const fr = (fillRgb >> 16) & 255;
        const fg = (fillRgb >> 8) & 255;
        const fb = fillRgb & 255;

        if (targetPixel[0] === fr && targetPixel[1] === fg && targetPixel[2] === fb) return;

        const stack = [[startX, startY]];
        const visited = new Set<string>();

        while (stack.length > 0) {
            const [cx, cy] = stack.pop()!;
            const key = `${cx},${cy}`;
            if (visited.has(key)) continue;
            if (cx < 0 || cx >= GRID_SIZE || cy < 0 || cy >= GRID_SIZE) continue;
            const pixel = getPixel(cx * CELL_SIZE + 1, cy * CELL_SIZE + 1);
            if (pixel[0] !== targetPixel[0] || pixel[1] !== targetPixel[1] || pixel[2] !== targetPixel[2]) continue;
            visited.add(key);
            paintCell(cx, cy, fillColor);
            stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (disabled) return;
        e.preventDefault();
        const cell = getCellFromEvent(e);
        if (!cell) return;
        setIsDrawing(true);
        if (tool === 'fill') {
            floodFill(cell.x, cell.y, selectedColor);
            return;
        }
        const color = tool === 'erase' ? '#FFFFFF' : selectedColor;
        paintCell(cell.x, cell.y, color);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || disabled || tool === 'fill') return;
        const cell = getCellFromEvent(e);
        if (!cell) return;
        const color = tool === 'erase' ? '#FFFFFF' : selectedColor;
        paintCell(cell.x, cell.y, color);
    };

    const handleMouseUp = () => setIsDrawing(false);

    useImperativeHandle(ref, () => ({
        getImageDataUrl: () => {
            const canvas = canvasRef.current;
            if (!canvas) return '';
            // Create a 64x64 export canvas
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = GRID_SIZE;
            exportCanvas.height = GRID_SIZE;
            const exportCtx = exportCanvas.getContext('2d');
            if (!exportCtx) return '';
            exportCtx.drawImage(canvas, 0, 0, GRID_SIZE, GRID_SIZE);
            return exportCanvas.toDataURL('image/png');
        },
        loadFromDataUrl: (dataUrl: string) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const img = new Image();
            img.onload = () => {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = dataUrl;
        },
        clear: () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        },
    }));

    return (
        <div className={'flex flex-col gap-4'}>
            {/* Toolbar */}
            <div className={'flex flex-wrap items-center gap-3'}>
                <div className={'flex gap-1'}>
                    {(['paint', 'erase', 'fill'] as const).map(t => (
                        <button
                            key={t}
                            type={'button'}
                            onClick={() => setTool(t)}
                            className={`rounded px-3 py-1 text-xs font-medium capitalize transition-colors ${
                                tool === t
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-zinc-700 text-neutral-300 hover:bg-zinc-600'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
                <label className={'flex items-center gap-2 text-xs text-neutral-400'}>
                    Custom colour
                    <input
                        type={'color'}
                        value={selectedColor}
                        onChange={e => setSelectedColor(e.target.value)}
                        className={'h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0'}
                    />
                </label>
            </div>

            {/* Minecraft palette */}
            <div className={'flex flex-wrap gap-1'}>
                {MINECRAFT_PALETTE.map(color => (
                    <button
                        key={color}
                        type={'button'}
                        onClick={() => { setSelectedColor(color); setTool('paint'); }}
                        title={color}
                        className={`h-6 w-6 rounded border-2 transition-transform hover:scale-110 ${
                            selectedColor === color && tool === 'paint'
                                ? 'border-white'
                                : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                    />
                ))}
            </div>

            {/* Canvas */}
            <div className={'overflow-auto rounded border border-zinc-600'}>
                <canvas
                    ref={canvasRef}
                    width={GRID_SIZE * CELL_SIZE}
                    height={GRID_SIZE * CELL_SIZE}
                    style={{
                        cursor: disabled ? 'not-allowed' : tool === 'erase' ? 'cell' : 'crosshair',
                        imageRendering: 'pixelated',
                        display: 'block',
                        maxWidth: '100%',
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onContextMenu={e => e.preventDefault()}
                />
            </div>
        </div>
    );
});

PixelEditor.displayName = 'PixelEditor';
export default PixelEditor;
