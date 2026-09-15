import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Send, Loader2, RotateCcw, Save, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface PromptOpt {
  value: string;
  label: string;
  version: number | null;
  mode: "draft" | "version";
}

export default function AiTrainingPlayground() {
  const [options, setOptions] = useState<PromptOpt[]>([]);
  const [selected, setSelected] = useState<string>("draft");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ version: string | null; knowledge: number; examples: number } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveScenario, setSaveScenario] = useState("");
  const [saveIdx, setSaveIdx] = useState<number>(-1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("ai_prompts")
        .select("version, status")
        .order("version", { ascending: false })
        .limit(20);
      const opts: PromptOpt[] = [];
      const hasDraft = (data || []).some((d: any) => d.status === "draft");
      if (hasDraft) opts.push({ value: "draft", label: "草稿版", version: null, mode: "draft" });
      const published = (data || []).find((d: any) => d.status === "published");
      if (published)
        opts.push({ value: `v${published.version}`, label: `正式版 v${published.version}`, version: published.version, mode: "version" });
      (data || []).forEach((d: any) => {
        if (d.status !== "published") {
          opts.push({ value: `v${d.version}`, label: `歷史 v${d.version}`, version: d.version, mode: "version" });
        }
      });
      setOptions(opts);
      if (!hasDraft && opts.length) setSelected(opts[0].value);
    })();

    void (async () => {
      const [{ count: kc }, { count: ec }] = await Promise.all([
        supabase.from("ai_knowledge").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("ai_examples").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
      setDebugInfo((prev) => ({ version: prev?.version ?? null, knowledge: kc ?? 0, examples: ec ?? 0 }));
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const content = input.trim();
    if (!content || loading) return;
    setInput("");
    const newMsgs: Msg[] = [...messages, { role: "user", content }];
    setMessages(newMsgs);
    setLoading(true);

    try {
      const opt = options.find((o) => o.value === selected);
      const params = new URLSearchParams({ skip_log: "true" });
      if (opt?.mode === "draft") params.set("mode", "draft");
      else if (opt?.version) params.set("version", String(opt.version));

      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-ai-chat?${params}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: newMsgs,
          session_id: `playground-${Date.now()}`,
          skip_log: true,
        }),
      });

      const versionHeader = res.headers.get("X-Prompt-Version");
      if (versionHeader) {
        setDebugInfo((p) => ({ ...(p || { knowledge: 0, examples: 0 }), version: versionHeader }));
      }

      if (!res.ok || !res.body) {
        toast.error("AI 回應失敗");
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantText = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const delta = j?.choices?.[0]?.delta?.content;
            if (typeof delta === "string") {
              assistantText += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      toast.error("發送失敗：" + e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    toast.success("已清空對話");
  };

  const openSaveDialog = () => {
    // Save last user+assistant pair
    let userIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && i > 0 && messages[i - 1].role === "user") {
        userIdx = i - 1;
        break;
      }
    }
    if (userIdx === -1) {
      toast.error("沒有可儲存的對話");
      return;
    }
    setSaveIdx(userIdx);
    setSaveScenario("");
    setSaveOpen(true);
  };

  const saveAsExample = async () => {
    if (saveIdx < 0 || !saveScenario.trim()) {
      toast.error("請填寫場景");
      return;
    }
    const { error } = await supabase.from("ai_examples").insert({
      scenario: saveScenario.trim(),
      user_message: messages[saveIdx].content,
      ideal_response: messages[saveIdx + 1].content,
      is_active: true,
    });
    if (error) return toast.error(error.message);
    toast.success("已儲存為訓練範例");
    setSaveOpen(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
      {/* Top control bar */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="選擇版本" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={reset}>
          <RotateCcw className="h-4 w-4 mr-1" /> 清空對話
        </Button>
        <Button size="sm" variant="outline" onClick={openSaveDialog}>
          <Save className="h-4 w-4 mr-1" /> 儲存為案例
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          目前載入：<span className="font-semibold">{options.find((o) => o.value === selected)?.label || "—"}</span>
          {debugInfo?.version && <span className="ml-2">回應版本 v{debugInfo.version}</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowDebug(!showDebug)}>
          {showDebug ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex-1 flex gap-3 overflow-hidden pt-3">
        {/* Chat area */}
        <div className="flex-1 flex flex-col border rounded-lg overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
            {messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">
                開始對話來測試小安的回應
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap shadow-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground ml-auto rounded-br-sm"
                    : "bg-card border rounded-bl-sm"
                )}
              >
                {m.content || (loading && i === messages.length - 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : null)}
              </div>
            ))}
          </div>

          <div className="border-t p-3 flex items-center gap-2 bg-card">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="輸入訊息測試小安⋯"
              disabled={loading}
            />
            <Button onClick={() => void send()} disabled={loading || !input.trim()} size="icon">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Debug panel */}
        {showDebug && (
          <aside className="w-[280px] border rounded-lg p-3 text-xs space-y-2 bg-muted/30">
            <div className="font-semibold text-sm">除錯資訊</div>
            <div className="space-y-1 text-muted-foreground">
              <div>實際回應版本：<span className="text-foreground">v{debugInfo?.version || "—"}</span></div>
              <div>知識條目：<span className="text-foreground">{debugInfo?.knowledge ?? 0}</span></div>
              <div>對話範例：<span className="text-foreground">{debugInfo?.examples ?? 0}</span></div>
            </div>
            <div className="pt-2 border-t text-muted-foreground">
              Playground 對話不會寫入統計紀錄
            </div>
          </aside>
        )}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>儲存為訓練範例</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">場景描述</label>
              <Input value={saveScenario} onChange={(e) => setSaveScenario(e.target.value)} placeholder="例：客人詢問寵物友善民宿" />
            </div>
            {saveIdx >= 0 && (
              <div className="text-xs text-muted-foreground space-y-1">
                <div><strong>使用者：</strong>{messages[saveIdx]?.content.slice(0, 100)}</div>
                <div><strong>小安：</strong>{messages[saveIdx + 1]?.content.slice(0, 100)}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>取消</Button>
            <Button onClick={saveAsExample}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
