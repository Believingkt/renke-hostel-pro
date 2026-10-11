/**
 * 行程分享對話框：短連結 + 複製 + QR code。
 * QR 使用輕量 qrcode 套件輸出 dataURL，不引入 canvas 元件庫。
 * 行程頁（TripDetail/TripEdit）與 AI 對話行程卡共用同一個元件。
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@lakeze/shared/components/ui/dialog";
import { copyText, ensureShareSlug, shareUrl } from "@lakeze/shared/lib/tripShare";
import { emitMetric } from "@lakeze/shared/lib/metric";
import { tripText, type TripLang } from "@lakeze/shared/lib/tripI18n";
import { toast } from "sonner";

interface Props {
  tripId: string;
  fallbackSlug?: string | null;
  lang: TripLang;
  /** 事件歸屬館別（AI 對話卡片帶入；行程頁省略＝null） */
  accommodationId?: string | null;
  /** 事件來源標記（AI 對話卡片帶 "ai_chat_card"） */
  source?: string;
  /** 自訂觸發按鈕樣式與文字（AI 對話卡片用行內 icon+文字；省略＝行程頁浮動圓鈕） */
  triggerClassName?: string;
  triggerLabel?: string;
}

export function ShareTripDialog({
  tripId,
  fallbackSlug,
  lang,
  accommodationId,
  source,
  triggerClassName,
  triggerLabel,
}: Props) {
  const t = tripText(lang);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const meta = source ? { source } : undefined;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const slug = fallbackSlug || (await ensureShareSlug(tripId)) || tripId;
      if (cancelled) return;
      const link = shareUrl(slug, lang);
      setUrl(link);
      try {
        const dataUrl = await QRCode.toDataURL(link, { width: 320, margin: 1 });
        if (!cancelled) setQr(dataUrl);
      } catch {
        /* QR 失敗不影響連結分享 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tripId, fallbackSlug, lang]);

  const onCopy = async () => {
    const ok = await copyText(url);
    if (ok) {
      emitMetric({ event_type: "trip_copy", ref_type: "trip", ref_id: tripId, accommodation_id: accommodationId ?? null, metadata: meta });
      setCopied(true);
      toast.success(t.copied);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) emitMetric({ event_type: "trip_share", ref_type: "trip", ref_id: tripId, accommodation_id: accommodationId ?? null, metadata: meta });
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        {triggerLabel ? (
          <button type="button" className={triggerClassName} aria-label={triggerLabel}>
            <Share2 className="h-3.5 w-3.5" />
            <span>{triggerLabel}</span>
          </button>
        ) : (
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/85 backdrop-blur"
            aria-label={t.share}
          >
            <Share2 className="h-4 w-4" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{t.shareTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {qr ? (
            <img src={qr} alt="QR code" className="h-40 w-40 rounded-lg border border-border" />
          ) : (
            <div className="h-40 w-40 rounded-lg bg-secondary" />
          )}
          <p className="text-center text-xs text-muted-foreground">{t.qrHint}</p>
          <div className="flex w-full items-center gap-2">
            <Input value={url} readOnly className="h-9 text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" onClick={onCopy} disabled={!url}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-1">{t.copyLink}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ShareTripDialog;
