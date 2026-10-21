import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Switch } from "@lakeze/shared/components/ui/switch";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { ORDER_SOURCE_DISPLAY_NAMES } from "@lakeze/shared/utils/orderHelpers";
import { getRevenueSourceWhitelist, getSourceOverrides, taipeiToday } from "@lakeze/shared/lib/teamBonusRevenue";

type Track = "shared" | "kol";
const TRACKS: Array<{ track: Track; title: string; table: string }> = [
  { track: "shared", title: "共用訂單來源（AM、成交）", table: "teamcommission_shared_revenue_source_whitelist" },
  { track: "kol", title: "獨立訂單來源（網紅營銷專利獎金）", table: "teamcommission_kol_revenue_source_whitelist" },
];
const labelOf = (s: string) => ORDER_SOURCE_DISPLAY_NAMES[s] ?? s;

/** 館別獎金設定：不列入抽成類、固定額合併群組、單館訂單來源覆蓋（super_admin、AM 總管可改） */
export function BonusVenueSection({ accId, canEdit }: { accId: string; canEdit: boolean }) {
  const monthStart = `${taipeiToday().slice(0, 7)}-01`;
  const [exclude, setExclude] = useState(false);
  const [group, setGroup] = useState("");
  const [globalSources, setGlobalSources] = useState<Record<Track, string[]>>({ shared: [], kol: [] });
  const [custom, setCustom] = useState<Record<Track, string[] | null>>({ shared: null, kol: null });
  const [initial, setInitial] = useState<Record<Track, string[] | null>>({ shared: null, kol: null });
  const [options, setOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const db = supabase as any;
    const [flagRes, gShared, gKol, oShared, oKol, srcRes] = await Promise.all([
      db.from("teamcommission_venue_bonus_flags").select("exclude_from_commission, fixed_merge_group").eq("accommodation_id", accId),
      getRevenueSourceWhitelist(db, TRACKS[0].table as any, monthStart),
      getRevenueSourceWhitelist(db, TRACKS[1].table as any, monthStart),
      getSourceOverrides(db, "shared", monthStart),
      getSourceOverrides(db, "kol", monthStart),
      db.rpc("get_all_order_sources"),
    ]);
    const flag = (flagRes.data ?? [])[0];
    setExclude(!!flag?.exclude_from_commission);
    setGroup(flag?.fixed_merge_group ?? "");
    setGlobalSources({ shared: gShared, kol: gKol });
    const cur = { shared: oShared.get(accId) ?? null, kol: oKol.get(accId) ?? null };
    setCustom(cur);
    setInitial(cur);
    const set = new Set<string>([...Object.keys(ORDER_SOURCE_DISPLAY_NAMES), ...gShared, ...gKol]);
    for (const v of (Array.isArray(srcRes?.data) ? srcRes.data : []) as string[]) if (typeof v === "string" && v.trim()) set.add(v.trim());
    setOptions([...set]);
  }, [accId, monthStart]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const db = supabase as any;
    const flag = await db.from("teamcommission_venue_bonus_flags").upsert(
      { accommodation_id: accId, exclude_from_commission: exclude, fixed_merge_group: group.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "accommodation_id" },
    );
    // 只寫入「本館自訂」或「從自訂改回全站」的軌；沒動過的沿用全站，不新增版本
    const rows = TRACKS.filter(({ track }) => custom[track] !== null || initial[track] !== null).map(({ track }) => ({
      accommodation_id: accId, track, effective_from: monthStart, included_order_sources: custom[track],
    }));
    const ov = rows.length
      ? await db.from("teamcommission_venue_revenue_source_overrides").upsert(rows, { onConflict: "accommodation_id,track,effective_from" })
      : { error: null };
    setSaving(false);
    if (flag.error || ov.error) return toast.error(`儲存失敗：${(flag.error ?? ov.error).message}`);
    toast.success("已儲存館別獎金設定（自本月起生效）");
    void load();
  };

  const toggle = (track: Track, src: string, on: boolean) =>
    setCustom((c) => ({ ...c, [track]: on ? [...(c[track] ?? []), src] : (c[track] ?? []).filter((x) => x !== src) }));

  return (
    <Card data-testid="onboarding-bonus-section">
      <CardHeader>
        <CardTitle className="text-base">獎金計算設定</CardTitle>
        <CardDescription>取代原本以館名「旅行日」判斷的規則；訂單來源未自訂時沿用全站設定。{canEdit ? "" : "（唯讀：由總部最高管理員、AM 總管設定）"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="bonus-exclude" className="text-sm">不列入抽成類獎金（AM 績效、AM 總管、成交組、成交大師、網紅專利、場域成交獎金）</Label>
          <Switch id="bonus-exclude" checked={exclude} onCheckedChange={setExclude} disabled={!canEdit} data-testid="bonus-exclude-switch" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bonus-group" className="text-sm">固定額合併群組（同群組多館只算一館；KOL 邀約同群組＝同一份合約）</Label>
          <Input id="bonus-group" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="例如：旅行日系列（留空＝不合併）" maxLength={40} disabled={!canEdit} data-testid="bonus-group-input" />
        </div>
        {TRACKS.map(({ track, title }) => (
          <div key={track} className="space-y-2 rounded-md border p-3" data-testid={`bonus-sources-${track}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{title}</span>
              <div className="flex items-center gap-2 text-xs">
                <span>{custom[track] ? "本館自訂" : "沿用全站"}</span>
                <Switch checked={!!custom[track]} disabled={!canEdit} data-testid={`bonus-sources-${track}-custom`}
                  onCheckedChange={(on) => setCustom((c) => ({ ...c, [track]: on ? [...globalSources[track]] : null }))} />
              </div>
            </div>
            {custom[track] ? (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {options.map((src) => (
                  <label key={src} className="flex items-center gap-1.5 text-xs">
                    <Checkbox checked={custom[track]!.includes(src)} disabled={!canEdit} onCheckedChange={(v) => toggle(track, src, v === true)} data-testid={`bonus-source-${track}-${src}`} />
                    {labelOf(src)}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid={`bonus-sources-${track}-global`}>全站：{globalSources[track].map(labelOf).join("、") || "（未設定）"}</p>
            )}
          </div>
        ))}
        {canEdit && (
          <Button size="sm" onClick={save} disabled={saving} data-testid="bonus-save-btn">{saving ? "儲存中…" : "儲存"}</Button>
        )}
      </CardContent>
    </Card>
  );
}
