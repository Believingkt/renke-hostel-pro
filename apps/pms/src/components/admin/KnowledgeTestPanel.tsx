import { useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

interface Props {
  accommodationId: string | null;
  /** 預填的測試問題（通常帶入正在編輯的問題標題） */
  defaultQuestion?: string;
}

/**
 * 常見問題「測試問答」面板：
 * 直接呼叫線上 AI 客服，確認剛剛儲存的內容有沒有被引用到。
 */
export default function KnowledgeTestPanel({ accommodationId, defaultQuestion = "" }: Props) {
  const [question, setQuestion] = useState(defaultQuestion);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    const content = question.trim();
    if (!content || loading) return;
    if (!accommodationId) {
      toast.error("請先選擇館別");
      return;
    }
    setLoading(true);
    setAnswer("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accommodation-ai-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            accommodation_id: accommodationId,
            messages: [{ role: "user", content }],
          }),
        },
      );

      if (!res.ok || !res.body) {
        toast.error("AI 回覆失敗，請稍後再試");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let text = "";
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
            const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
            if (typeof delta === "string") {
              text += delta;
              setAnswer(text);
            }
          } catch {
            /* 忽略非 JSON 片段 */
          }
        }
      }
    } catch (e: unknown) {
      toast.error("測試失敗：" + (e instanceof Error ? e.message : "未知錯誤"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void ask();
            }
          }}
          placeholder="輸入客人可能會問的話，看看客服怎麼回答"
          disabled={loading}
        />
        <Button type="button" onClick={() => void ask()} disabled={loading || !question.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {(answer || loading) && (
        <div className="border rounded-md p-3 bg-muted/30 text-sm whitespace-pre-wrap min-h-[64px]">
          {answer || <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        測試會呼叫線上客服，剛剛儲存的內容即時生效。
      </p>
    </div>
  );
}
