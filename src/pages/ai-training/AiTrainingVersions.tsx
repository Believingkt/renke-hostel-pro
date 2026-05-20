import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { FileText, GitCompare, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import ReactDiffViewer from "react-diff-viewer-continued";

interface PromptVer {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  persona_name: string;
  system_prompt: string;
  tone_rules: string | null;
  forbidden_topics: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
}

interface ABTest {
  id: string;
  version_a: number;
  version_b: number;
  traffic_split: number;
  is_active: boolean;
  started_at: string;
  ended_at: string | null;
}

export default function AiTrainingVersions() {
  const [versions, setVersions] = useState<PromptVer[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<PromptVer | null>(null);
  const [comparing, setComparing] = useState<{ a: PromptVer; b: PromptVer } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<PromptVer | null>(null);

  // A/B
  const [activeAb, setActiveAb] = useState<ABTest | null>(null);
  const [abForm, setAbForm] = useState({ a: "", b: "", split: 50 });

  const load = async () => {
    const { data } = await supabase
      .from("ai_prompts")
      .select("*")
      .order("version", { ascending: false });
    const list = (data as any) || [];
    setVersions(list);
    const userIds = Array.from(new Set(list.map((v: any) => v.created_by).filter(Boolean)));
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds as string[]);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => (map[p.id] = p.email));
      setEmails(map);
    }
  };

  const loadAb = async () => {
    const { data } = await supabase
      .from("ai_ab_tests")
      .select("*")
      .eq("is_active", true)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveAb((data as any) || null);
  };

  useEffect(() => {
    void load();
    void loadAb();
  }, []);

  const restoreAsDraft = async () => {
    if (!restoreTarget) return;
    // Find or create draft
    const { data: existingDraft } = await supabase
      .from("ai_prompts")
      .select("id")
      .eq("status", "draft")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload = {
      persona_name: restoreTarget.persona_name,
      system_prompt: restoreTarget.system_prompt,
      tone_rules: restoreTarget.tone_rules,
      forbidden_topics: restoreTarget.forbidden_topics,
      notes: `從 v${restoreTarget.version} 還原`,
    };

    if (existingDraft) {
      const { error } = await supabase
        .from("ai_prompts")
        .update(payload)
        .eq("id", (existingDraft as any).id);
      if (error) return toast.error(error.message);
    } else {
      const { data: max } = await supabase
        .from("ai_prompts")
        .select("version")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextV = ((max as any)?.version ?? 0) + 1;
      const { error } = await supabase.from("ai_prompts").insert({
        ...payload,
        status: "draft",
        version: nextV,
      });
      if (error) return toast.error(error.message);
    }
    toast.success(`已將 v${restoreTarget.version} 還原為草稿`);
    setRestoreTarget(null);
    await load();
  };

  const deleteVersion = async (v: PromptVer) => {
    if (v.status !== "archived") return toast.error("僅可刪除已封存的版本");
    if (!confirm(`確定刪除 v${v.version}？`)) return;
    const { error } = await supabase.from("ai_prompts").delete().eq("id", v.id);
    if (error) return toast.error(error.message);
    toast.success("已刪除");
    await load();
  };

  const startAb = async () => {
    const a = Number(abForm.a);
    const b = Number(abForm.b);
    if (!a || !b || a === b) return toast.error("請選擇兩個不同版本");
    // End old
    if (activeAb) {
      await supabase
        .from("ai_ab_tests")
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq("id", activeAb.id);
    }
    const { error } = await supabase.from("ai_ab_tests").insert({
      version_a: a,
      version_b: b,
      traffic_split: abForm.split,
      is_active: true,
    });
    if (error) return toast.error(error.message);
    toast.success("A/B 測試已啟用");
    await loadAb();
  };

  const stopAb = async () => {
    if (!activeAb) return;
    const { error } = await supabase
      .from("ai_ab_tests")
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq("id", activeAb.id);
    if (error) return toast.error(error.message);
    toast.success("已停用 A/B 測試");
    await loadAb();
  };

  const statusBadge = (s: string) => {
    if (s === "published") return <Badge className="bg-green-600 hover:bg-green-700">published</Badge>;
    if (s === "draft") return <Badge className="bg-yellow-500 hover:bg-yellow-600">draft</Badge>;
    return <Badge variant="secondary">archived</Badge>;
  };

  const compareWithPrev = (v: PromptVer) => {
    const idx = versions.findIndex((x) => x.id === v.id);
    const prev = versions[idx + 1];
    if (!prev) return toast.error("沒有前一版可比對");
    setComparing({ a: prev, b: v });
  };

  return (
    <div className="space-y-4">
      {/* A/B Test panel */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">A/B 測試</h3>
            <p className="text-xs text-muted-foreground">啟用後前台流量會依 session 分配到兩個版本</p>
          </div>
          <Switch
            checked={!!activeAb}
            onCheckedChange={(v) => {
              if (!v) void stopAb();
            }}
          />
        </div>
        {activeAb ? (
          <div className="text-sm bg-muted/30 rounded p-3 flex items-center justify-between">
            <div>
              啟用中：<strong>v{activeAb.version_a}</strong> ({activeAb.traffic_split}%) vs{" "}
              <strong>v{activeAb.version_b}</strong> ({100 - activeAb.traffic_split}%)
              <span className="ml-2 text-xs text-muted-foreground">
                自 {format(new Date(activeAb.started_at), "MM/dd HH:mm")} 起
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={stopAb}>停用</Button>
          </div>
        ) : (
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">版本 A</label>
              <Select value={abForm.a} onValueChange={(v) => setAbForm({ ...abForm, a: v })}>
                <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="選擇" /></SelectTrigger>
                <SelectContent>
                  {versions.map((v) => <SelectItem key={v.id} value={String(v.version)}>v{v.version}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">版本 B</label>
              <Select value={abForm.b} onValueChange={(v) => setAbForm({ ...abForm, b: v })}>
                <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="選擇" /></SelectTrigger>
                <SelectContent>
                  {versions.map((v) => <SelectItem key={v.id} value={String(v.version)}>v{v.version}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">A 流量 %</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={abForm.split}
                onChange={(e) => setAbForm({ ...abForm, split: Number(e.target.value) })}
                className="w-[100px] h-9"
              />
            </div>
            <Button size="sm" onClick={startAb}>啟用 A/B 測試</Button>
          </div>
        )}
      </Card>

      {/* Versions timeline */}
      <div className="space-y-3">
        {versions.map((v) => (
          <Card key={v.id} className="p-4">
            <div className="flex items-start gap-4">
              <div className="text-3xl font-bold text-primary min-w-[60px]">v{v.version}</div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(v.status)}
                  <span className="text-xs text-muted-foreground">
                    {v.published_at
                      ? `發佈於 ${format(new Date(v.published_at), "yyyy/MM/dd HH:mm")}`
                      : `建立於 ${format(new Date(v.created_at), "yyyy/MM/dd HH:mm")}`}
                  </span>
                  {v.created_by && emails[v.created_by] && (
                    <span className="text-xs text-muted-foreground">· {emails[v.created_by]}</span>
                  )}
                </div>
                {v.notes && <div className="text-sm text-muted-foreground">備註：{v.notes}</div>}
                <div className="text-xs text-muted-foreground line-clamp-2 bg-muted/30 rounded p-2 font-mono">
                  {v.system_prompt.slice(0, 200) || "(無內容)"}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setViewing(v)}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> 查看完整
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRestoreTarget(v)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> 還原為草稿
                </Button>
                <Button size="sm" variant="outline" onClick={() => compareWithPrev(v)}>
                  <GitCompare className="h-3.5 w-3.5 mr-1" /> 比對前一版
                </Button>
                {v.status === "archived" && (
                  <Button size="sm" variant="ghost" onClick={() => deleteVersion(v)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> 刪除
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {versions.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">尚無任何版本</div>
        )}
      </div>

      {/* View detail dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>v{viewing?.version} 完整內容</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div><strong>人格名稱：</strong>{viewing.persona_name}</div>
              <div>
                <strong>系統提示詞：</strong>
                <pre className="mt-1 p-3 bg-muted rounded text-xs whitespace-pre-wrap font-mono">
                  {viewing.system_prompt}
                </pre>
              </div>
              {viewing.tone_rules && (
                <div>
                  <strong>語氣規則：</strong>
                  <pre className="mt-1 p-3 bg-muted rounded text-xs whitespace-pre-wrap font-mono">
                    {viewing.tone_rules}
                  </pre>
                </div>
              )}
              {viewing.forbidden_topics && (
                <div>
                  <strong>禁止主題：</strong>
                  <pre className="mt-1 p-3 bg-muted rounded text-xs whitespace-pre-wrap font-mono">
                    {viewing.forbidden_topics}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Compare dialog */}
      <Dialog open={!!comparing} onOpenChange={(o) => !o && setComparing(null)}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              比對 v{comparing?.a.version} → v{comparing?.b.version}
            </DialogTitle>
          </DialogHeader>
          {comparing && (
            <div className="text-xs">
              <ReactDiffViewer
                oldValue={comparing.a.system_prompt || ""}
                newValue={comparing.b.system_prompt || ""}
                splitView
                leftTitle={`v${comparing.a.version}`}
                rightTitle={`v${comparing.b.version}`}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restore confirm */}
      <Dialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>還原為草稿</DialogTitle>
            <DialogDescription>
              將 v{restoreTarget?.version} 的內容覆蓋目前草稿，是否確認？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>取消</Button>
            <Button onClick={restoreAsDraft}>確認還原</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
