import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Trash2 } from "lucide-react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

export default function AdminAiTrainingPlayground() {
  const { currentAccommodationId } = useAccommodation();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !currentAccommodationId || sending) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/accommodation-ai-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          accommodation_id: currentAccommodationId,
          messages: newMessages,
          skip_log: true,
        }),
      });
      if (!res.ok || !res.body) {
        const t = await res.text();
        toast.error("AI 錯誤：" + t.slice(0, 200));
        setMessages(newMessages);
        setSending(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const p = t.slice(5).trim();
          if (p === "[DONE]") continue;
          try {
            const j = JSON.parse(p);
            const d = j.choices?.[0]?.delta?.content;
            if (d) {
              acc += d;
              setMessages([...newMessages, { role: "assistant", content: acc }]);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      toast.error("連線錯誤：" + e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">即時測試</h1>
          <p className="text-sm text-muted-foreground mt-1">用目前已發佈的 AI 設定進行對話測試（不寫入紀錄）。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMessages([])}>
          <Trash2 className="h-4 w-4" />清除對話
        </Button>
      </div>

      <Card className="flex flex-col h-[600px]">
        <ScrollArea className="flex-1 p-4" ref={scrollRef as any}>
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-12">
              開始對話以測試 AI 管家的回應...
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    {m.content || "..."}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="輸入訊息..."
            disabled={sending}
          />
          <Button onClick={send} disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
