import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { X, Save, Rocket } from "lucide-react";
import { useAccommodation } from "@/contexts/AccommodationContext";

type PromptRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  persona_name: string;
  system_prompt: string;
  tone_rules: string | null;
  forbidden_topics: string | null;
  notes: string | null;
  published_at: string | null;
  accommodation_id: string | null;
};

export default function AdminAiTrainingPrompt() {
  const { currentAccommodationId } = useAccommodation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draft, setDraft] = useState<PromptRow | null>(null);
  const [published, setPublished] = useState<PromptRow | null>(null);

  const [personaName, setPersonaName] = useState("小安");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [toneRules, setToneRules] = useState("");
  const [forbiddenList, setForbiddenList] = useState<string[]>([]);
  const [forbiddenInput, setForbiddenInput] = useState("");
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!currentAccommodationId) return;
    setLoading(true);
    const [{ data: d }, { data: p }] = await Promise.all([
      supabase.from("ai_prompts").select("*")
        .eq("accommodation_id", currentAccommodationId)
        .eq("status", "draft")
        .order("version", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ai_prompts").select("*")
        .eq("accommodation_id", currentAccommodationId)
        .eq("status", "published")
        .order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setDraft(d as PromptRow | null);
    setPublished(p as PromptRow | null);
    const src = (d || p) as PromptRow | null;
    if (src) {
      setPersonaName(src.persona_name || "小安");
      setSystemPrompt(src.system_prompt || "");
      setToneRules(src.tone_rules || "");
      setForbiddenList(src.forbidden_topics ? src.forbidden_topics.split("|").filter(Boolean) : []);
      setNotes(src.notes || "");
    }
    setDirty(false);
    setLoading(false);
  }, [currentAccommodationId]);

  useEffect(() => { void load(); }, [load]);

  const saveDraft = async (silent = false) => {
    if (!currentAccommodationId) return false;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      persona_name: personaName || "小安",
      system_prompt: systemPrompt,
      tone_rules: toneRules || null,
      forbidden_topics: forbiddenList.length ? forbiddenList.join("|") : null,
      notes: notes || null,
      status: "draft" as const,
      accommodation_id: currentAccommodationId,
      created_by: user?.id ?? null,
    };
    let res;
    if (draft) {
      res = await supabase.from("ai_prompts").update(payload).eq("id", draft.id).select().single();
    } else {
      const maxVer = Math.max(published?.version ?? 0, 0);
      res = await supabase.from("ai_prompts").insert({ ...payload, version: maxVer + 1 }).select().single();
    }
    setSaving(false);
    if (res.error) { toast.error("儲存失敗：" + res.error.message); return false; }
    setDraft(res.data as PromptRow);
    setDirty(false);
    if (!silent) toast.success("草稿已儲存");
    return true;
  };

  const publish = async () => {
    if (!systemPrompt.trim()) { toast.error("系統提示詞不可為空"); return; }
    if (!currentAccommodationId) return;
    setPublishing(true);
    const saved = await saveDraft(true);
    if (!saved) { setPublishing(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const maxVer = Math.max(published?.version ?? 0, draft?.version ?? 0);
    const newVersion = maxVer + 1;

    if (published) {
      await supabase.from("ai_prompts").update({ status: "archived" }).eq("id", published.id);
    }
    const { data: d } = await supabase.from("ai_prompts").select("id")
      .eq("accommodation_id", currentAccommodationId)
      .eq("status", "draft").order("version", { ascending: false }).limit(1).maybeSingle();
    if (d) {
      const { error } = await supabase.from("ai_prompts").update({
        status: "published",
        version: newVersion,
        published_at: new Date().toISOString(),
        created_by: user?.id ?? null,
      }).eq("id", d.id);
      if (error) { toast.error("發佈失敗：" + error.message); setPublishing(false); return; }
    }
    toast.success(`已發佈為 v${newVersion}`);
    setPublishing(false);
    await load();
  };

  const addForbidden = () => {
    const t = forbiddenInput.trim();
    if (!t || forbiddenList.includes(t)) { setForbiddenInput(""); return; }
    setForbiddenList([...forbiddenList, t]);
    setForbiddenInput("");
    setDirty(true);
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">系統提示詞</h1>
          <p className="text-sm text-muted-foreground mt-1">編輯本民宿 AI 管家的人格、語氣與禁忌主題。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => saveDraft(false)} disabled={saving}>
            <Save className="h-4 w-4" />{saving ? "儲存中..." : "儲存草稿"}
          </Button>
          <Button onClick={publish} disabled={publishing}
            className="bg-[#F97316] hover:bg-[#F97316]/90 text-white">
            <Rocket className="h-4 w-4" />{publishing ? "發佈中..." : "發佈為正式版本"}
          </Button>
        </div>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <Label>AI 人格名稱</Label>
          <Input value={personaName} onChange={(e) => { setPersonaName(e.target.value); setDirty(true); }} />
        </div>
        <div>
          <Label>核心系統提示詞 *</Label>
          <p className="text-xs text-muted-foreground mb-2">
            可用變數：<code>{"{{今天日期}}"}</code>、<code>{"{{民宿地點}}"}</code>、<code>{"{{房型清單}}"}</code>
          </p>
          <Textarea
            value={systemPrompt}
            onChange={(e) => { setSystemPrompt(e.target.value); setDirty(true); }}
            className="font-mono text-sm min-h-[300px]"
            placeholder={`你是「${personaName}」，本民宿的 AI 管家。請以親切、簡短的繁體中文回應旅客的訂房諮詢...`}
          />
        </div>
        <div>
          <Label>語氣規則</Label>
          <Textarea
            value={toneRules}
            onChange={(e) => { setToneRules(e.target.value); setDirty(true); }}
            placeholder="例：使用親切口語、避免艱深用語、回應簡短不超過 2 句"
            className="min-h-[100px]"
          />
        </div>
        <div>
          <Label>禁止回答主題</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={forbiddenInput}
              onChange={(e) => setForbiddenInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addForbidden(); } }}
              placeholder="輸入後按 Enter 加入"
            />
            <Button type="button" variant="outline" onClick={addForbidden}>加入</Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 min-h-[2rem]">
            {forbiddenList.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button onClick={() => { setForbiddenList(forbiddenList.filter((x) => x !== t)); setDirty(true); }}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {!forbiddenList.length && <span className="text-sm text-muted-foreground">尚未設定禁止主題</span>}
          </div>
        </div>
        <div>
          <Label>修改備註</Label>
          <Input value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            placeholder="本次調整的原因（會記錄在版本歷史）" />
        </div>
      </Card>

      {published && (
        <Card className="p-4 text-sm space-y-1 bg-muted/30">
          <div className="font-semibold">目前正式版本 v{published.version}</div>
          {published.published_at && (
            <div className="text-xs text-muted-foreground">
              發佈於 {new Date(published.published_at).toLocaleString("zh-TW")}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
