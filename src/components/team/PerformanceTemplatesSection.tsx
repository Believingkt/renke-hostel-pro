import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Copy, ExternalLink, Plus, Star, Trash2, ChevronUp, ChevronDown } from "lucide-react";

export interface PerfTemplate {
  id: string;
  accommodation_id: string;
  name: string;
  body: string;
  is_primary: boolean;
  include_modified_notice: boolean;
  display_order: number;
  enabled: boolean;
}

interface Props {
  accommodationId: string;
  defaultBody: string;
  templateVars: string[];
}

interface TargetRow {
  id: string;
  label: string | null;
  performance_template_id: string | null;
  accommodation_ids: string[] | null;
  custom_venue_ids: string[] | null;
  custom_venue_names: string[] | null;
  event_types: string[] | null;
}

export default function PerformanceTemplatesSection({
  accommodationId,
  defaultBody,
  templateVars,
}: Props) {
  const [items, setItems] = useState<PerfTemplate[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    if (!accommodationId) return;
    const [tplRes, tgtRes] = await Promise.all([
      supabase
        .from("performance_notification_templates")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .order("display_order", { ascending: true }),
      supabase
        .from("line_push_targets")
        .select("id,label,performance_template_id,accommodation_ids,custom_venue_ids,custom_venue_names,event_types")
        .eq("is_active", true),
    ]);
    if (tplRes.error) {
      toast.error("載入模板失敗：" + tplRes.error.message);
      return;
    }
    const rows = (tplRes.data || []) as unknown as PerfTemplate[];
    setItems(rows);
    setActiveId((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? ""));
    setTargets(
      ((tgtRes.data || []) as unknown as TargetRow[]).filter((t) => {
        if (!(t.event_types ?? []).includes("daily_performance")) return false;
        const accIds = t.accommodation_ids ?? [];
        const venueIds = t.custom_venue_ids ?? [];
        const venueNames = t.custom_venue_names ?? [];
        const isAll = accIds.length === 0 && venueIds.length === 0 && venueNames.length === 0;
        return isAll || accIds.includes(accommodationId);
      }),
    );
  }, [accommodationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = items.find((t) => t.id === activeId) ?? null;
  const primary = items.find((t) => t.is_primary) ?? null;

  const patchActive = (patch: Partial<PerfTemplate>) => {
    if (!active) return;
    setItems((prev) => prev.map((t) => (t.id === active.id ? { ...t, ...patch } : t)));
  };

  const groupsUsing = (tplId: string) =>
    targets.filter((t) =>
      t.performance_template_id === tplId ||
      (!t.performance_template_id && primary?.id === tplId),
    );

  const handleCreate = async (copyFrom?: PerfTemplate) => {
    const { data, error } = await supabase
      .from("performance_notification_templates")
      .insert({
        accommodation_id: accommodationId,
        name: copyFrom ? `${copyFrom.name} 複本` : "新模板",
        body: copyFrom ? copyFrom.body : defaultBody,
        is_primary: items.length === 0,
        include_modified_notice: copyFrom ? copyFrom.include_modified_notice : true,
        display_order: items.length,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      toast.error("新增失敗：" + error.message);
      return;
    }
    toast.success("已新增模板");
    await load();
    if (data?.id) setActiveId(data.id as string);
  };

  const handleSave = async () => {
    if (!active) return;
    setSaving(true);
    const { error } = await supabase
      .from("performance_notification_templates")
      .update({
        name: active.name.trim() || "未命名模板",
        body: active.body,
        include_modified_notice: active.include_modified_notice,
        enabled: active.enabled,
      })
      .eq("id", active.id);
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    toast.success("模板已儲存");
    await load();
  };

  const handleSetPrimary = async (tpl: PerfTemplate) => {
    if (tpl.is_primary) return;
    const prev = primary;
    if (prev) {
      const { error } = await supabase
        .from("performance_notification_templates")
        .update({ is_primary: false })
        .eq("id", prev.id);
      if (error) return toast.error("設定失敗：" + error.message);
    }
    const { error } = await supabase
      .from("performance_notification_templates")
      .update({ is_primary: true, enabled: true })
      .eq("id", tpl.id);
    if (error) return toast.error("設定失敗：" + error.message);
    toast.success("已設為 Email 完整版");
    await load();
  };

  const handleDelete = async (tpl: PerfTemplate) => {
    if (tpl.is_primary) {
      toast.error("完整版模板不可刪除，請先將其他模板設為完整版");
      return;
    }
    const bound = targets.filter((t) => t.performance_template_id === tpl.id);
    if (bound.length > 0) {
      toast.error(`仍有 ${bound.length} 個 LINE 群組使用此模板，請先改綁其他模板`);
      return;
    }
    const { error } = await supabase
      .from("performance_notification_templates")
      .delete()
      .eq("id", tpl.id);
    if (error) return toast.error("刪除失敗：" + error.message);
    toast.success("已刪除模板");
    await load();
  };

  const move = async (tpl: PerfTemplate, dir: -1 | 1) => {
    const idx = items.findIndex((t) => t.id === tpl.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
    const other = items[swapIdx];
    await Promise.all([
      supabase.from("performance_notification_templates").update({ display_order: swapIdx }).eq("id", tpl.id),
      supabase.from("performance_notification_templates").update({ display_order: idx }).eq("id", other.id),
    ]);
    await load();
  };

  const insertVar = (v: string) => {
    if (!active) return;
    const el = bodyRef.current;
    const text = active.body ?? "";
    if (!el) {
      patchActive({ body: text + v });
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    patchActive({ body: text.slice(0, start) + v + text.slice(end) });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + v.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold">通報模板</h3>
          <p className="text-xs text-muted-foreground">
            同一館別可建立多份模板：Email 固定只寄「完整版」，各 LINE 群組可分別訂閱不同模板。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/team/lineoa">
              LINE OA 群組設定 <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
          <Button size="sm" onClick={() => handleCreate()}>
            <Plus className="h-4 w-4 mr-1" /> 新增模板
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
          尚無模板，點「新增模板」建立第一份（將自動成為 Email 完整版）。
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)] gap-3">
          {/* Template list */}
          <div className="space-y-1 min-w-0">

            {items.map((t, i) => (
              <div
                key={t.id}
                className={cn(
                  "rounded-md border px-2 py-2 space-y-1 cursor-pointer min-w-0",
                  activeId === t.id ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}
                onClick={() => setActiveId(t.id)}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-sm truncate flex-1 min-w-0">{t.name}</span>
                  {t.is_primary && <Badge variant="success" className="shrink-0">完整版</Badge>}
                  {!t.enabled && <Badge variant="secondary" className="shrink-0">停用</Badge>}
                </div>
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {groupsUsing(t.id).length} 個群組使用
                  </span>
                  <div className="flex items-center shrink-0">

                    <Button variant="ghost" size="icon" className="h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); void move(t, -1); }} disabled={i === 0}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6"
                      onClick={(e) => { e.stopPropagation(); void move(t, 1); }} disabled={i === items.length - 1}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6"
                      title="複製" onClick={(e) => { e.stopPropagation(); void handleCreate(t); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6"
                      title="設為 Email 完整版" onClick={(e) => { e.stopPropagation(); void handleSetPrimary(t); }}
                      disabled={t.is_primary}>
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost-destructive" size="icon" className="h-6 w-6"
                      title="刪除" onClick={(e) => { e.stopPropagation(); void handleDelete(t); }}
                      disabled={t.is_primary}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Editor */}
          {active && (
            <div className="space-y-3 border rounded-md p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">模板名稱</Label>
                  <Input value={active.name} onChange={(e) => patchActive({ name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">狀態</Label>
                  <div className="flex items-center gap-4 h-10">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={active.enabled}
                        disabled={active.is_primary}
                        onCheckedChange={(v) => patchActive({ enabled: v })}
                      />
                      <span className="text-sm">啟用</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={active.include_modified_notice}
                        onCheckedChange={(v) => patchActive({ include_modified_notice: v })}
                      />
                      <span className="text-sm">附加歷史訂單異動提醒</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {templateVars.map((v) => (
                  <Badge key={v} variant="outline" className="cursor-pointer hover:bg-muted"
                    onClick={() => insertVar(v)}>
                    {v}
                  </Badge>
                ))}
              </div>

              <Textarea
                ref={bodyRef}
                rows={16}
                className="font-mono text-sm"
                value={active.body}
                placeholder="留空則使用系統預設模板"
                onChange={(e) => patchActive({ body: e.target.value })}
              />

              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  訂閱此模板的 LINE 群組：
                  {groupsUsing(active.id).length === 0
                    ? "（尚無）"
                    : groupsUsing(active.id).map((g) => g.label || g.id).join("、")}
                </p>
                <p>
                  未指定模板的群組會自動使用「完整版」。要調整群組訂閱，請至{" "}
                  <Link to="/team/lineoa" className="text-primary underline">LINE OA 設定</Link>。
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "儲存中..." : "儲存模板"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
