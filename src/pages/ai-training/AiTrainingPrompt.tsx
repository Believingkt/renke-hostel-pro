import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { X, Upload, Variable, Eye, FlaskConical, Save, Rocket } from "lucide-react";
import ReactMarkdown from "react-markdown";

type PromptRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  persona_name: string;
  persona_avatar_url: string | null;
  system_prompt: string;
  tone_rules: string | null;
  forbidden_topics: string | null;
  notes: string | null;
  published_at: string | null;
  created_at: string;
  created_by: string | null;
};

const VARIABLES = ["{{今天日期}}", "{{房型清單}}", "{{民宿地點}}", "{{使用者人數}}"];

// Persona intro stored as first line of notes prefixed with [intro]:
function parsePersonaIntro(notes: string | null): { intro: string; rest: string } {
  if (!notes) return { intro: "", rest: "" };
  const match = notes.match(/^\[intro\]:(.*?)(?:\n|$)([\s\S]*)/);
  if (match) return { intro: match[1].trim(), rest: match[2] };
  return { intro: "", rest: notes };
}
function combineNotes(intro: string, rest: string) {
  const r = (rest || "").trim();
  if (!intro && !r) return null;
  if (!intro) return r;
  return `[intro]:${intro}\n${r}`;
}

export default function AiTrainingPrompt() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [draft, setDraft] = useState<PromptRow | null>(null);
  const [published, setPublished] = useState<PromptRow | null>(null);
  const [publisherEmail, setPublisherEmail] = useState<string | null>(null);

  const [personaName, setPersonaName] = useState("小安");
  const [personaIntro, setPersonaIntro] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [toneRules, setToneRules] = useState("");
  const [forbiddenList, setForbiddenList] = useState<string[]>([]);
  const [forbiddenInput, setForbiddenInput] = useState("");
  const [notes, setNotes] = useState("");

  const [previewMd, setPreviewMd] = useState(false);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Load draft + published
  const loadPrompts = useCallback(async () => {
    setLoading(true);
    const [{ data: d }, { data: p }] = await Promise.all([
      supabase.from("ai_prompts").select("*").eq("status", "draft")
        .order("version", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ai_prompts").select("*").eq("status", "published")
        .order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setDraft(d as PromptRow | null);
    setPublished(p as PromptRow | null);
    const src = (d || p) as PromptRow | null;
    if (src) {
      setPersonaName(src.persona_name || "小安");
      setAvatarUrl(src.persona_avatar_url);
      setSystemPrompt(src.system_prompt || "");
      setToneRules(src.tone_rules || "");
      setForbiddenList(
        src.forbidden_topics
          ? src.forbidden_topics.split("|").map((s) => s.trim()).filter(Boolean)
          : []
      );
      const { intro, rest } = parsePersonaIntro(src.notes);
      setPersonaIntro(intro);
      setNotes(rest);
    }
    if (p?.created_by) {
      const { data: prof } = await supabase
        .from("profiles").select("email").eq("id", p.created_by).maybeSingle();
      setPublisherEmail(prof?.email ?? null);
    }
    setDirty(false);
    setLoading(false);
  }, []);

  useEffect(() => { void loadPrompts(); }, [loadPrompts]);

  // Save draft (upsert)
  const saveDraft = useCallback(async (silent = false) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      persona_name: personaName || "小安",
      persona_avatar_url: avatarUrl,
      system_prompt: systemPrompt,
      tone_rules: toneRules || null,
      forbidden_topics: forbiddenList.length ? forbiddenList.join("|") : null,
      notes: combineNotes(personaIntro, notes),
      status: "draft" as const,
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
    if (res.error) {
      toast.error("儲存失敗：" + res.error.message);
      return false;
    }
    setDraft(res.data as PromptRow);
    setDirty(false);
    if (!silent) toast.success("草稿已儲存");
    return true;
  }, [personaName, avatarUrl, systemPrompt, toneRules, forbiddenList, personaIntro, notes, draft, published]);

  // Debounced autosave
  useEffect(() => {
    if (loading) return;
    if (!dirty) return;
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => { void saveDraft(true); }, 30000);
    return () => { if (debounceTimer.current) window.clearTimeout(debounceTimer.current); };
  }, [dirty, loading, saveDraft]);

  // beforeunload
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const markDirty = () => setDirty(true);

  // Publish
  const publish = async () => {
    if (!systemPrompt.trim()) { toast.error("系統提示詞不可為空"); return; }
    setPublishing(true);
    const saved = await saveDraft(true);
    if (!saved) { setPublishing(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    const maxVer = Math.max(published?.version ?? 0, draft?.version ?? 0);
    const newVersion = maxVer + 1;

    // Archive existing published
    if (published) {
      await supabase.from("ai_prompts").update({ status: "archived" }).eq("id", published.id);
    }
    // Promote draft → published with bumped version
    const { data: d } = await supabase.from("ai_prompts").select("id").eq("status", "draft")
      .order("version", { ascending: false }).limit(1).maybeSingle();
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
    await loadPrompts();
  };

  // Restore published to draft
  const restoreFromPublished = async () => {
    if (!published) return;
    if (dirty && !confirm("有未存草稿，繼續會覆蓋目前編輯內容，確定？")) return;
    if (draft) {
      await supabase.from("ai_prompts").delete().eq("id", draft.id);
    }
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("ai_prompts").insert({
      version: (published.version ?? 0) + 1,
      status: "draft",
      persona_name: published.persona_name,
      persona_avatar_url: published.persona_avatar_url,
      system_prompt: published.system_prompt,
      tone_rules: published.tone_rules,
      forbidden_topics: published.forbidden_topics,
      notes: published.notes,
      created_by: user?.id ?? null,
    });
    toast.success(`已從 v${published.version} 還原為草稿`);
    await loadPrompts();
  };

  // Avatar upload
  const onAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("請選擇圖片檔"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("圖片需小於 2MB"); return; }
    const path = `persona/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("ai-assets").upload(path, file, { upsert: true });
    if (error) { toast.error("上傳失敗：" + error.message); return; }
    const { data } = supabase.storage.from("ai-assets").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    markDirty();
    toast.success("頭像已上傳");
  };

  const insertVariable = (v: string) => {
    const el = promptRef.current;
    if (!el) { setSystemPrompt(systemPrompt + v); markDirty(); return; }
    const s = el.selectionStart ?? systemPrompt.length;
    const e = el.selectionEnd ?? systemPrompt.length;
    const next = systemPrompt.slice(0, s) + v + systemPrompt.slice(e);
    setSystemPrompt(next);
    markDirty();
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + v.length, s + v.length);
    });
  };

  const addForbidden = () => {
    const t = forbiddenInput.trim();
    if (!t) return;
    if (forbiddenList.includes(t)) { setForbiddenInput(""); return; }
    setForbiddenList([...forbiddenList, t]);
    setForbiddenInput("");
    markDirty();
  };
  const removeForbidden = (t: string) => {
    setForbiddenList(forbiddenList.filter((x) => x !== t));
    markDirty();
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">系統提示詞</h1>
        <p className="text-sm text-muted-foreground mt-1">編輯小安的角色設定、語氣與禁忌主題。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* 左欄編輯區 */}
        <div className="space-y-6">
          {/* 人格設定 */}
          <Card className="p-5 space-y-4">
            <h2 className="text-lg font-semibold">AI 人格設定</h2>
            <div className="grid gap-4 md:grid-cols-[120px_1fr]">
              <div>
                <Label className="block mb-2">頭像</Label>
                <div
                  className="w-24 h-24 rounded-full border bg-muted flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-80"
                  onClick={() => fileInput.current?.click()}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onAvatarUpload} />
              </div>
              <div className="space-y-3">
                <div>
                  <Label>人格名稱</Label>
                  <Input value={personaName} onChange={(e) => { setPersonaName(e.target.value); markDirty(); }} />
                </div>
                <div>
                  <Label>一句話自我介紹</Label>
                  <Input
                    value={personaIntro}
                    placeholder="例如：我是小安，幫您找到最適合的住宿。"
                    onChange={(e) => { setPersonaIntro(e.target.value); markDirty(); }}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* 核心系統提示詞 */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">核心系統提示詞</h2>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setPreviewMd((v) => !v)}>
                  <Eye className="h-4 w-4" />{previewMd ? "編輯" : "預覽 Markdown"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Variable className="h-4 w-4" />插入變數
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {VARIABLES.map((v) => (
                      <DropdownMenuItem key={v} onClick={() => insertVariable(v)}>{v}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {previewMd ? (
              <div className="prose prose-sm max-w-none border rounded-md p-4 bg-muted/30 min-h-[400px]">
                <ReactMarkdown>{systemPrompt || "（無內容）"}</ReactMarkdown>
              </div>
            ) : (
              <Textarea
                ref={promptRef}
                value={systemPrompt}
                onChange={(e) => { setSystemPrompt(e.target.value); markDirty(); }}
                className="font-mono text-sm min-h-[480px]"
                placeholder="輸入系統提示詞..."
              />
            )}
          </Card>

          {/* 語氣規則 */}
          <Card className="p-5 space-y-3">
            <h2 className="text-lg font-semibold">語氣規則</h2>
            <Textarea
              value={toneRules}
              onChange={(e) => { setToneRules(e.target.value); markDirty(); }}
              placeholder="例如：使用親切口語、避免艱深用語、回應簡短不超過 2 句..."
              className="min-h-[120px]"
            />
          </Card>

          {/* 禁止主題 */}
          <Card className="p-5 space-y-3">
            <h2 className="text-lg font-semibold">禁止回答主題</h2>
            <div className="flex gap-2">
              <Input
                value={forbiddenInput}
                onChange={(e) => setForbiddenInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addForbidden(); } }}
                placeholder="輸入後按 Enter 加入"
              />
              <Button type="button" variant="outline" onClick={addForbidden}>加入</Button>
            </div>
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {forbiddenList.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button onClick={() => removeForbidden(t)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {!forbiddenList.length && <span className="text-sm text-muted-foreground">尚未設定禁止主題</span>}
            </div>
          </Card>

          {/* 修改備註 */}
          <Card className="p-5 space-y-3">
            <Label className="text-base font-semibold">修改備註</Label>
            <Input
              value={notes}
              onChange={(e) => { setNotes(e.target.value); markDirty(); }}
              placeholder="本次調整的原因（會記錄在版本歷史）"
            />
          </Card>
        </div>

        {/* 右欄活動區 */}
        <div className="space-y-4">
          <div className="space-y-2 sticky top-20">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => saveDraft(false)}
              disabled={saving}
            >
              <Save className="h-4 w-4" />{saving ? "儲存中..." : "儲存草稿"}
            </Button>
            <Button
              className="w-full bg-[#F97316] hover:bg-[#F97316]/90 text-white"
              onClick={publish}
              disabled={publishing}
            >
              <Rocket className="h-4 w-4" />{publishing ? "發佈中..." : "發佈為正式版本"}
            </Button>

            <Card className="p-4 space-y-2">
              <div className="text-sm font-semibold">目前正式版本</div>
              {published ? (
                <>
                  <div className="text-xs text-muted-foreground">
                    v{published.version}
                    {published.published_at && (
                      <> · {new Date(published.published_at).toLocaleString("zh-TW")}</>
                    )}
                  </div>
                  {publisherEmail && (
                    <div className="text-xs text-muted-foreground">發佈者：{publisherEmail}</div>
                  )}
                  <div className="text-xs border-l-2 border-muted pl-2 text-muted-foreground line-clamp-4">
                    {published.system_prompt.slice(0, 200) || "（無內容）"}
                  </div>
                  <button
                    onClick={restoreFromPublished}
                    className="text-xs text-primary hover:underline"
                  >
                    還原此版本為草稿
                  </button>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">尚未發佈任何版本</div>
              )}
            </Card>

            <Button variant="outline" className="w-full" onClick={() => setPlaygroundOpen(true)}>
              <FlaskConical className="h-4 w-4" />快速測試
            </Button>

            {dirty && (
              <div className="text-xs text-muted-foreground text-center">
                有未儲存變更（30 秒後自動儲存）
              </div>
            )}
          </div>
        </div>
      </div>

      <Sheet open={playgroundOpen} onOpenChange={setPlaygroundOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>快速測試</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <FlaskConical className="h-10 w-10 mb-3" />
            <p>測試功能將在下階段完成</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
