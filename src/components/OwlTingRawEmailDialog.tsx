import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawEmailId: string | null;
}

interface RawEmail {
  id: string;
  subject: string | null;
  from_email: string | null;
  received_at: string;
  html_body: string | null;
  text_body: string | null;
}

export function OwlTingRawEmailDialog({ open, onOpenChange, rawEmailId }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RawEmail | null>(null);

  useEffect(() => {
    if (!open || !rawEmailId) return;
    setData(null);
    setLoading(true);
    (async () => {
      const { data: row, error } = await supabase
        .from("owlting_email_orders_raw")
        .select("id, subject, from_email, received_at, html_body, text_body")
        .eq("id", rawEmailId)
        .maybeSingle();
      if (error) toast.error("讀取失敗：" + error.message);
      setData((row as RawEmail) ?? null);
      setLoading(false);
    })();
  }, [open, rawEmailId]);

  const html = data?.html_body ?? "";
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(400);

  const getBounds = () => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    // Dialog 上限 90vh，扣除 header / padding，留給 iframe 的最大高度
    const max = Math.max(320, Math.floor(vh * 0.9) - 140);
    // 視窗很小時，最小高度也要跟著縮，避免比 max 還大
    const min = Math.min(280, max);
    return { min, max };
  };

  const measureIframe = () => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) return;
    const body = doc.body;
    const root = doc.documentElement;
    const contentHeight = Math.max(
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      root?.scrollHeight ?? 0,
      root?.offsetHeight ?? 0,
    );
    const { min, max } = getBounds();
    // 內容尚未渲染：保留現值，避免閃爍
    if (!contentHeight) return;
    const next = Math.min(Math.max(contentHeight + 8, min), max);
    setIframeHeight((prev) => (Math.abs(prev - next) < 2 ? prev : next));
  };

  // 監聽 iframe 內部 DOM、圖片、字體變化 + window resize
  useEffect(() => {
    if (!open || !html) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    let mo: MutationObserver | null = null;
    let ro: ResizeObserver | null = null;
    const imgListeners: Array<{ img: HTMLImageElement; fn: () => void }> = [];
    const timers: number[] = [];

    const attachObservers = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      measureIframe();

      mo = new MutationObserver(() => measureIframe());
      mo.observe(doc.body, { childList: true, subtree: true, attributes: true, characterData: true });

      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => measureIframe());
        ro.observe(doc.body);
        if (doc.documentElement) ro.observe(doc.documentElement);
      }

      // 圖片載入完成後再量一次（HTML email 常見大量 img）
      doc.querySelectorAll("img").forEach((img) => {
        if (!(img instanceof HTMLImageElement)) return;
        if (img.complete) return;
        const fn = () => measureIframe();
        img.addEventListener("load", fn);
        img.addEventListener("error", fn);
        imgListeners.push({ img, fn });
      });

      // 字體就緒後重量
      const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
      if (fonts?.ready) fonts.ready.then(() => measureIframe()).catch(() => {});

      // 兜底幾個 timing 點
      timers.push(window.setTimeout(measureIframe, 150));
      timers.push(window.setTimeout(measureIframe, 600));
      timers.push(window.setTimeout(measureIframe, 1500));
    };

    const onLoad = () => attachObservers();
    iframe.addEventListener("load", onLoad);
    // 若 srcDoc 已經完成載入，立即量一次
    if (iframe.contentDocument?.readyState === "complete") attachObservers();

    const onResize = () => measureIframe();
    window.addEventListener("resize", onResize);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("resize", onResize);
      mo?.disconnect();
      ro?.disconnect();
      imgListeners.forEach(({ img, fn }) => {
        img.removeEventListener("load", fn);
        img.removeEventListener("error", fn);
      });
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [open, html]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {data?.subject ?? "原始信件"}
          </DialogTitle>
          {data && (
            <div className="text-xs text-muted-foreground">
              {data.from_email} ・ {new Date(data.received_at).toLocaleString()}
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <div className="py-12 text-center text-sm text-muted-foreground">找不到資料</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto border rounded-md bg-white">
            {html ? (
              <iframe
                ref={iframeRef}
                title="email-preview"
                srcDoc={html}
                sandbox="allow-same-origin"
                style={{ height: iframeHeight }}
                className="w-full block bg-white"
              />
            ) : (
              <div className="p-6 text-sm text-muted-foreground">無 HTML 內容</div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
