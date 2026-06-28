import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, X, Headphones, LogIn, Trash2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "react-router-dom";

type Msg = { id?: string; role: "user" | "assistant"; content: string };

interface Props {
  accommodationId: string;
  accommodationName?: string;
  contactHref?: string | null;
}

export default function FloatingAIChat({ accommodationId, accommodationName, contactHref }: Props) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const location = useLocation();

  // Auth state
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load history when opened
  useEffect(() => {
    if (!open || !userId) return;
    supabase
      .from("villa_chat_messages")
      .select("id, role, content")
      .eq("user_id", userId)
      .eq("accommodation_id", accommodationId)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (data) setMessages(data as Msg[]);
      });
  }, [open, userId, accommodationId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    setStreaming("");

    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);

    // Persist only if logged in
    if (userId) {
      await supabase.from("villa_chat_messages").insert({
        user_id: userId,
        accommodation_id: accommodationId,
        role: "user",
        content: text,
      });
    }

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accommodation-ai-chat`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          accommodation_id: accommodationId,
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        if (res.status === 429) toast({ title: "請稍候", description: "詢問太頻繁，請稍後再試", variant: "destructive" });
        else if (res.status === 402) toast({ title: "AI 服務暫時不可用", description: "請改用真人客服", variant: "destructive" });
        else toast({ title: "對話失敗", description: errText.slice(0, 120) || "請稍後再試", variant: "destructive" });
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const l = line.trim();
          if (!l.startsWith("data:")) continue;
          const payload = l.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const delta = j?.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              setStreaming(full);
            }
          } catch {}
        }
      }

      if (full) {
        setMessages((m) => [...m, { role: "assistant", content: full }]);
        setStreaming("");
        if (userId) {
          await supabase.from("villa_chat_messages").insert({
            user_id: userId,
            accommodation_id: accommodationId,
            role: "assistant",
            content: full,
          });
        }
      } else {
        setStreaming("");
      }
    } catch (e: any) {
      toast({ title: "連線失敗", description: e?.message || "請稍後再試", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!userId) return;
    await supabase
      .from("villa_chat_messages")
      .delete()
      .eq("user_id", userId)
      .eq("accommodation_id", accommodationId);
    setMessages([]);
  };

  return (
    <>
      {/* 懸浮按鈕 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="開啟 AI 管家"
          className="fixed z-[70] right-3 rounded-full shadow-lg flex items-center justify-center text-white active:scale-95 hover:opacity-100 transition-opacity"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 180px)",
            width: 40,
            height: 40,
            opacity: 0.7,
            background: "linear-gradient(135deg, #F08A3E, #E5701A)",
          }}
        >
          <MessageCircle className="w-[20px] h-[20px]" />

        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col rounded-t-2xl z-[80]">

          <SheetHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                style={{ background: "linear-gradient(135deg, #F08A3E, #E5701A)" }}
              >
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <SheetTitle className="text-base">AI 管家</SheetTitle>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {accommodationName || "民宿"}・回答基本問題
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && userId && (
                <Button variant="ghost" size="icon" onClick={clearHistory} aria-label="清除對話">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </SheetHeader>

          <>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && !streaming && (
                  <div className="text-center pt-6 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      您好，我是 {accommodationName || "本民宿"} 的 AI 管家，<br />
                      可以回答房型、價格、設施等基本問題。
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center pt-2">
                      {[
                        "有哪些房型？",
                        "可以帶寵物嗎？",
                        "有附停車場嗎？",
                        "幾點可以入住？",
                      ].map((q) => (
                        <button
                          key={q}
                          onClick={() => setInput(q)}
                          className="px-3 py-1.5 text-xs rounded-full border border-border bg-muted/40 hover:bg-muted"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <MessageBubble key={m.id || i} role={m.role} content={m.content} />
                ))}
                {streaming && <MessageBubble role="assistant" content={streaming} />}
                {loading && !streaming && (
                  <div className="flex gap-1 items-center text-muted-foreground text-sm pl-1">
                    <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.15s]" />
                    <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:0.3s]" />
                  </div>
                )}
              </div>

              {contactHref && (
                <div className="px-4 pb-1">
                  <a
                    href={contactHref}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    需要真人協助？點此轉接客服
                  </a>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="border-t px-3 py-2 flex gap-2 items-center"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="輸入您的問題…"
                  disabled={loading}
                  className="flex-1"
                  style={{ fontSize: 16 }}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={loading || !input.trim()}
                  style={{ background: "#F08A3E" }}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </>

        </SheetContent>
      </Sheet>
    </>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser ? "text-white" : "bg-muted text-foreground"
        }`}
        style={isUser ? { background: "#F08A3E" } : undefined}
      >
        {content}
      </div>
    </div>
  );
}
