import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, Loader2 } from "lucide-react";
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

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已複製${label}`);
    } catch {
      toast.error("複製失敗");
    }
  };

  const html = data?.html_body ?? "";
  const text = data?.text_body ?? "";

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
          <Tabs defaultValue="rendered" className="flex-1 overflow-hidden flex flex-col">
            <TabsList>
              <TabsTrigger value="rendered">渲染預覽</TabsTrigger>
              <TabsTrigger value="html">HTML 原始碼</TabsTrigger>
              <TabsTrigger value="text">純文字</TabsTrigger>
            </TabsList>

            <TabsContent value="rendered" className="flex-1 overflow-auto border rounded-md bg-white">
              {html ? (
                <iframe
                  title="email-preview"
                  srcDoc={html}
                  sandbox=""
                  className="w-full min-h-[60vh] bg-white"
                />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">無 HTML 內容</div>
              )}
            </TabsContent>

            <TabsContent value="html" className="flex-1 overflow-auto">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="outline" onClick={() => copy(html, "HTML")} disabled={!html}>
                  <Copy className="h-3.5 w-3.5 mr-1" />複製 HTML
                </Button>
              </div>
              <textarea
                readOnly
                value={html}
                className="w-full h-[60vh] font-mono text-xs p-3 border rounded-md bg-muted/30"
                onFocus={(e) => e.currentTarget.select()}
              />
            </TabsContent>

            <TabsContent value="text" className="flex-1 overflow-auto">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="outline" onClick={() => copy(text, "純文字")} disabled={!text}>
                  <Copy className="h-3.5 w-3.5 mr-1" />複製文字
                </Button>
              </div>
              <textarea
                readOnly
                value={text}
                className="w-full h-[60vh] font-mono text-xs p-3 border rounded-md bg-muted/30"
                onFocus={(e) => e.currentTarget.select()}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
