import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  HERO_ASPECT_DESKTOP,
  HERO_ASPECT_MOBILE,
  clampPercent,
  clampZoom,
  coverImageStyle,
  type CoverDevice,
  type CoverFocus,
} from "@/lib/coverFocus";

interface Props {
  imageUrl: string | null | undefined;
  desktop: CoverFocus;
  mobile: CoverFocus;
  onChange: (next: { desktop: CoverFocus; mobile: CoverFocus }) => void;
  className?: string;
}

const DEFAULT: CoverFocus = { x: 50, y: 50, zoom: 1 };

/**
 * 所見即所得的封面顯示範圍編輯器：
 * 固定的 Hero 比例框內拖曳／縮放圖片，框即為前台實際可見區域。
 * 儲存 x / y（object-position %）與 zoom，與前台使用同一套 coverImageStyle。
 */
export function CoverCropEditor({ imageUrl, desktop, mobile, onChange, className }: Props) {
  const [device, setDevice] = useState<CoverDevice>("desktop");
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);

  const focus = device === "desktop" ? desktop : mobile;
  const aspect = device === "desktop" ? HERO_ASPECT_DESKTOP : HERO_ASPECT_MOBILE;

  const set = useCallback(
    (next: CoverFocus) => {
      onChange(device === "desktop" ? { desktop: next, mobile } : { desktop, mobile: next });
    },
    [device, desktop, mobile, onChange],
  );

  const overflow = () => {
    const el = frameRef.current;
    if (!el || !nat) return null;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const s = Math.max(w / nat.w, h / nat.h) * focus.zoom;
    return { ox: Math.max(0, nat.w * s - w), oy: Math.max(0, nat.h * s - h) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, x: focus.x, y: focus.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const ov = overflow();
    if (!ov) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    const nx = ov.ox > 0 ? d.x - (dx / ov.ox) * 100 : d.x;
    const ny = ov.oy > 0 ? d.y - (dy / ov.oy) * 100 : d.y;
    set({ ...focus, x: clampPercent(nx), y: clampPercent(ny) });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // 桌機滾輪縮放
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      set({ ...focus, zoom: clampZoom(focus.zoom + (e.deltaY > 0 ? -0.05 : 0.05)) });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [focus, set]);

  if (!imageUrl) return null;

  return (
    <div className={className}>
      <p className="mb-2 text-xs text-muted-foreground">
        建議尺寸 2400×900（桌機）以上，建議比例 16:6；可分別調整桌機與手機顯示範圍。
      </p>

      <Tabs value={device} onValueChange={(v) => setDevice(v as CoverDevice)}>
        <TabsList className="mb-2">
          <TabsTrigger value="desktop">桌機封面</TabsTrigger>
          <TabsTrigger value="mobile">手機封面</TabsTrigger>
        </TabsList>
      </Tabs>

      <p className="mb-2 text-xs text-muted-foreground">拖曳圖片調整顯示位置，使用下方縮放控制顯示範圍。框內即為前台實際可見區域。</p>

      <div
        className={device === "mobile" ? "mx-auto w-full max-w-[420px]" : "w-full"}
        style={{ touchAction: "none" }}
      >
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
          className="relative w-full cursor-grab overflow-hidden rounded-lg border-2 border-primary/60 bg-muted active:cursor-grabbing"
          style={{ aspectRatio: String(aspect) }}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="封面顯示範圍編輯"
            draggable={false}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="pointer-events-none h-full w-full select-none object-cover"
            style={coverImageStyle(focus)}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 p-0"
          aria-label="縮小"
          onClick={() => set({ ...focus, zoom: clampZoom(focus.zoom - 0.1) })}
        >
          <Minus className="block h-4 w-4 shrink-0" />
        </Button>
        <Slider
          value={[focus.zoom]}
          min={1}
          max={3}
          step={0.05}
          onValueChange={([v]) => set({ ...focus, zoom: clampZoom(v) })}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 p-0"
          aria-label="放大"
          onClick={() => set({ ...focus, zoom: clampZoom(focus.zoom + 0.1) })}
        >
          <Plus className="block h-4 w-4 shrink-0" />
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => set({ ...focus, x: 50, y: 50 })}>
          <Crosshair className="mr-1 block h-4 w-4 shrink-0" />
          重新置中
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => set({ ...DEFAULT })}>
          <RotateCcw className="mr-1 block h-4 w-4 shrink-0" />
          重設
        </Button>
      </div>

      <Collapsible className="mt-2">
        <CollapsibleTrigger className="text-xs text-muted-foreground underline underline-offset-4">
          進階設定（精確數值）
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1 text-xs text-muted-foreground tabular-nums">
          {device === "desktop" ? "桌機" : "手機"}：水平 {focus.x}%・垂直 {focus.y}%・縮放 {focus.zoom.toFixed(2)}x
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default CoverCropEditor;
