import { useRef } from "react";
import { cn } from "@/lib/utils";

interface Props {
  imageUrl: string | null | undefined;
  x: number;
  y: number;
  onChange: (next: { x: number; y: number }) => void;
  className?: string;
}

const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

/**
 * 封面圖顯示範圍設定：點擊／拖曳指定「重點位置」，前台以 object-position 呈現。
 * 僅影響顯示裁切，不修改原圖檔。
 */
export function CoverFocusField({ imageUrl, x, y, onChange, className }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);

  const pick = (clientX: number, clientY: number) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onChange({
      x: clamp(((clientX - r.left) / r.width) * 100),
      y: clamp(((clientY - r.top) / r.height) * 100),
    });
  };

  if (!imageUrl) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-muted-foreground">
        點擊圖片指定顯示重點（例如主建築或招牌），手機版裁切較窄時會以此為中心。
      </p>
      <div
        ref={boxRef}
        role="presentation"
        onClick={(e) => pick(e.clientX, e.clientY)}
        onPointerMove={(e) => {
          if (e.buttons === 1) pick(e.clientX, e.clientY);
        }}
        className="relative w-full cursor-crosshair overflow-hidden rounded-lg border border-border"
      >
        <img src={imageUrl} alt="封面圖顯示位置設定" className="w-full select-none object-contain" draggable={false} />
        <span
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/25 shadow"
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-muted-foreground">
          水平 {Math.round(x)}%
          <input
            type="range"
            min={0}
            max={100}
            value={x}
            onChange={(e) => onChange({ x: Number(e.target.value), y })}
            className="mt-1 w-full accent-primary"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          垂直 {Math.round(y)}%
          <input
            type="range"
            min={0}
            max={100}
            value={y}
            onChange={(e) => onChange({ x, y: Number(e.target.value) })}
            className="mt-1 w-full accent-primary"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">桌機預覽（16:6）</p>
          <img
            src={imageUrl}
            alt="桌機封面預覽"
            className="aspect-[16/6] w-full rounded-md object-cover"
            style={{ objectPosition: `${x}% ${y}%` }}
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">手機預覽（16:10）</p>
          <img
            src={imageUrl}
            alt="手機封面預覽"
            className="aspect-[16/10] w-full rounded-md object-cover"
            style={{ objectPosition: `${x}% ${y}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default CoverFocusField;
