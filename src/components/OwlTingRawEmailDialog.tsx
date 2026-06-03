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

  const maxIframeHeight = () =>
    Math.max(320, Math.floor(window.innerHeight * 0.9) - 140);

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
    if (!contentHeight) return;
    setIframeHeight(Math.min(contentHeight + 8, maxIframeHeight()));
  };

  useEffect(() => {
    if (!open) return;
    const onResize = () => measureIframe();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

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
                onLoad={() => {
                  measureIframe();
                  setTimeout(measureIframe, 200);
                  setTimeout(measureIframe, 800);
                }}
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
