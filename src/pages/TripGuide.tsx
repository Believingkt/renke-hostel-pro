import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Loader2, Send, Sparkles, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import assistantAvatar from "@/assets/assistant-avatar-xiaoan.png?inline";

const GUIDE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/traveler-guide`;

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface Attrs {
  trip_duration: string | null;
  festival: string | null;
  party_size: number | null;
  companion_type: string | null;
  purpose: string | null;
  budget: number | null;
  highlights: string[] | null;
}

const EMPTY: Attrs = {
  trip_duration: null,
  festival: null,
  party_size: null,
  companion_type: null,
  purpose: null,
  budget: null,
  highlights: null,
};

const FIELD_LABELS: { key: keyof Attrs; label: string }[] = [
  { key: "trip_duration", label: "遊玩期程" },
  { key: "festival", label: "節日情境" },
  { key: "party_size", label: "同行人數" },
  { key: "companion_type", label: "同行夥伴" },
  { key: "purpose", label: "旅遊目的" },
  { key: "budget", label: "每人預算" },
  { key: "highlights", label: "遊玩重點" },
];

function formatValue(key: keyof Attrs, value: Attrs[keyof Attrs]) {
  if (value === null || (Array.isArray(value) && value.length === 0)) return null;
  if (Array.isArray(value)) return value.join("、");
  if (key === "budget") return `NT$ ${Number(value).toLocaleString()}`;
  if (key === "party_size") return `${value} 人`;
  return String(value);
}

function getSessionId() {
  try {
    let sid = sessionStorage.getItem("traveler_guide_session_id");
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem("traveler_guide_session_id", sid);
    }
    return sid;
  } catch {
    return crypto.randomUUID();
  }
}

const TripGuide = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sessionId = useMemo(getSessionId, []);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [attrs, setAttrs] = useState<Attrs>(EMPTY);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  const filledCount = FIELD_LABELS.filter((f) => formatValue(f.key, attrs[f.key])).length;

  const callGuide = async (history: Msg[], known: Attrs) => {
    setIsLoading(true);
    try {
      const resp = await fetch(GUIDE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history, known }),
      });

      if (resp.status === 429) {
        toast({ title: "請求過於頻繁", description: "請稍後再試", variant: "destructive" });
        return;
      }
      if (!resp.ok) throw new Error("guide failed");

      const data = await resp.json();
      const merged: Attrs = { ...known };
      (Object.keys(EMPTY) as (keyof Attrs)[]).forEach((k) => {
        const v = data.extracted?.[k];
        if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
          (merged as Record<string, unknown>)[k] = v;
        }
      });
      setAttrs(merged);
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      if (data.done) void saveAttributes(merged);
    } catch (e) {
      console.error("traveler guide error", e);
      toast({ title: "小安暫時無法回應", description: "請稍後再試", variant: "destructive" });
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const saveAttributes = async (value: Attrs) => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("traveler_attributes").insert({
        user_id: auth.user?.id ?? null,
        session_id: sessionId,
        ...value,
      });
      if (error) throw error;
      setSaved(true);
      toast({ title: "旅遊屬性已歸檔", description: "之後推薦行程會參考這些偏好" });
    } catch (e) {
      console.error("save traveler attributes failed", e);
      toast({ title: "屬性儲存失敗", description: "請稍後再試一次", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void callGuide([], EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || isLoading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    void callGuide(next, attrs);
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-muted/40 flex flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur px-4 py-3 flex items-center gap-3">
        <img src={assistantAvatar} alt="小安" className="h-9 w-9 rounded-full object-cover ring-2 ring-primary/30" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold leading-tight">動態行旅導引 · 小安</h1>
          <p className="text-xs text-muted-foreground leading-tight">
            {isLoading ? "小安思考中…" : `已收集 ${filledCount}/7 項旅遊屬性`}
          </p>
        </div>
        {saved && (
          <Badge variant="secondary" className="gap-1">
            <Check className="h-3 w-3" /> 已歸檔
          </Badge>
        )}
      </header>

      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex flex-wrap gap-1.5">
          {FIELD_LABELS.map((f) => {
            const v = formatValue(f.key, attrs[f.key]);
            return (
              <Badge key={f.key} variant={v ? "default" : "outline"} className="text-xs font-normal">
                {f.label}
                {v ? `：${v}` : ""}
              </Badge>
            );
          })}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2 text-sm whitespace-pre-wrap break-words">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-2">
              <img src={assistantAvatar} alt="" className="h-7 w-7 rounded-full object-cover mt-0.5 shrink-0" />
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-card border px-3.5 py-2 text-sm prose prose-sm max-w-none [&>p]:my-0">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            </div>
          ),
        )}
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            小安思考中…
          </div>
        )}
        {saved && (
          <div className="pt-2">
            <Button className="w-full" onClick={() => navigate("/trips")}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              去看看推薦行程
            </Button>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur px-3 py-2.5 flex gap-2 items-center">
        <Input
          ref={inputRef}
          autoFocus
          placeholder="輸入你的回答…"
          className="flex-1 rounded-full"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          disabled={isLoading}
        />
        <Button size="icon" className="rounded-full shrink-0" onClick={() => send(input)} disabled={!input.trim() || isLoading}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default TripGuide;
