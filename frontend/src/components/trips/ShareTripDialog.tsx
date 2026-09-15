/**
 * 行程分享對話框：短連結 + 複製 + QR code。
 * QR 使用輕量 qrcode 套件輸出 dataURL，不引入 canvas 元件庫。
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { copyText, ensureShareSlug, shareUrl } from "@/lib/tripShare";
import { tripText, type TripLang } from "@/lib/tripI18n";
import { toast } from "sonner";

interface Props {
  tripId: string;
  fallbackSlug?: string | null;
  lang: TripLang;
}

export function ShareTripDialog({ tripId, fallbackSlug, lang }: Props) {
  const t = tripText(lang);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);

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
      setCopied(true);
      toast.success(t.copied);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/85 backdrop-blur"
          aria-label={t.share}
        >
          <Share2 className="h-4 w-4" />
        </button>
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
