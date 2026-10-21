import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@lakeze/shared/components/ui/alert-dialog";
import { ORDER_SOURCE_DISPLAY_NAMES } from "@lakeze/shared/utils/orderHelpers";
import { getRevenueSourceWhitelist, taipeiToday } from "@lakeze/shared/lib/teamBonusRevenue";
import { isAllowedEffectiveFrom, monthStartOf, selectableMonths, type OverrideRow, type Track } from "@/lib/venueSourceVersions";
import { HelpDialogButton } from "./HelpDialogButton";
import { SourceTrackBlock } from "./SourceTrackBlock";
import { VenueFlagsBlock } from "./VenueFlagsBlock";

const TRACKS: Array<{ track: Track; title: string; table: string }> = [
  { track: "shared", title: "共用訂單來源（AM、成交）", table: "teamcommission_shared_revenue_source_whitelist" },
  { track: "kol", title: "獨立訂單來源（網紅營銷專利獎金）", table: "teamcommission_kol_revenue_source_whitelist" },
];
const OVERRIDES = "teamcommission_venue_revenue_source_overrides";

/** 館別獎金設定：特殊館別兩設定＋單館訂單來源覆蓋（super_admin、AM 總管可改） */
export function BonusVenueSection({ accId, canEdit }: { accId: string; canEdit: boolean }) {
  const today = taipeiToday();
  const monthStart = monthStartOf(today);
  const [globalSources, setGlobalSources] = useState<Record<Track, string[]>>({ shared: [], kol: [] });
  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [options, setOptions] = useState<string[]>([]);
  const [cancelRow, setCancelRow] = useState<OverrideRow | null>(null);

  const load = useCallback(async () => {
    const db = supabase as any;
    const [gShared, gKol, ovRes, srcRes] = await Promise.all([
      getRevenueSourceWhitelist(db, TRACKS[0].table as any, monthStart),
      getRevenueSourceWhitelist(db, TRACKS[1].table as any, monthStart),
      db.from(OVERRIDES).select("id, track, included_order_sources, effective_from, created_at").eq("accommodation_id", accId),
      db.rpc("get_all_order_sources"),
    ]);
    setGlobalSources({ shared: gShared, kol: gKol });
    setRows((ovRes.data ?? []) as OverrideRow[]);
    const set = new Set<string>([...Object.keys(ORDER_SOURCE_DISPLAY_NAMES), ...gShared, ...gKol]);
    for (const v of (Array.isArray(srcRes?.data) ? srcRes.data : []) as string[]) if (typeof v === "string" && v.trim()) set.add(v.trim());
    setOptions([...set]);
  }, [accId, monthStart]);
  useEffect(() => { void load(); }, [load]);

  const saveVersion = async (track: Track, month: string, sources: string[] | null) => {
    if (!isAllowedEffectiveFrom(month, today)) { toast.error("生效日只能選本月或之後的 1 日"); return false; }
    const { error } = await (supabase as any).from(OVERRIDES).upsert(
      { accommodation_id: accId, track, effective_from: month, included_order_sources: sources },
      { onConflict: "accommodation_id,track,effective_from" },
    );
    if (error) { toast.error(`儲存失敗：${error.message}`); return false; }
    toast.success(`已儲存 ${month} 生效的版本`);
    void load();
    return true;
  };

  const cancelFuture = async () => {
    if (!cancelRow) return;
    const { error } = await (supabase as any).from(OVERRIDES).delete().eq("id", cancelRow.id);
    setCancelRow(null);
    if (error) return toast.error(`取消失敗：${error.message}`);
    toast.success("已取消排定的版本");
    void load();
  };

  return (
    <Card data-testid="onboarding-bonus-section">
      <CardHeader>
        <CardTitle className="flex items-center gap-1 text-base">獎金計算設定<SourceHelp /></CardTitle>
        <CardDescription>訂單來源沒有自訂時，沿用全站設定。{canEdit ? "" : "（唯讀：由總部最高管理員、AM 總管設定）"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <VenueFlagsBlock accId={accId} canEdit={canEdit} />
        {TRACKS.map(({ track, title }) => (
          <SourceTrackBlock key={track} track={track} title={title} rows={rows.filter((r) => r.track === track)}
            globalSources={globalSources[track]} options={options} months={selectableMonths(today)} monthStart={monthStart}
            canEdit={canEdit} onSave={saveVersion} onCancelFuture={setCancelRow} />
        ))}
      </CardContent>
      <AlertDialog open={!!cancelRow} onOpenChange={(o) => !o && setCancelRow(null)}>
        <AlertDialogContent data-testid="bonus-cancel-future-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>取消 {cancelRow?.effective_from} 排定的版本？</AlertDialogTitle>
            <AlertDialogDescription>取消後，那個月份會繼續沿用前一個版本。只有還沒開始的月份可以取消。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="bonus-cancel-future-no">保留</AlertDialogCancel>
            <AlertDialogAction onClick={() => void cancelFuture()} data-testid="bonus-cancel-future-yes">確定取消</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SourceHelp() {
  return (
    <HelpDialogButton title="獎金計算設定說明" testId="bonus-sources">
      <p><strong>訂單來源</strong>決定這間館哪些訂單的營收會算進獎金。分成兩條：「共用」給 AM 與成交獎金用，「獨立」給網紅營銷專利獎金用。沒有自訂時，一律沿用全站清單。</p>
      <p className="font-medium">什麼時候開始算？</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>每個月的獎金，都用「那個月 1 日當天已經生效」的版本計算。</li>
        <li>所以生效日只能選某個月的 1 日，而且只能選本月或之後，不能回頭改過去的月份。</li>
        <li>例：今天是 6/15，選 7/1 → 7 月的訂單起算，8 月 10 日發放的獎金才採用；6 月仍用舊設定。選本月 6/1 → 6 月的訂單就改用新設定，7 月 10 日發放的獎金採用。</li>
      </ul>
      <p className="font-medium">操作步驟</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>按「新增本館自訂版本」，選生效月份，勾選要採計的來源（可先「從全站清單帶入」再增減）。</li>
        <li>按「下一步：確認」，檢查和全站的差異與起算月份。</li>
        <li>按「確定儲存」。版本會出現在「已排定」或「本月計算採用」。</li>
        <li>想回到全站設定：按「改回沿用全站」，同樣選生效月份。</li>
        <li>還沒開始的已排定版本，可以按「取消排定」。</li>
      </ol>
    </HelpDialogButton>
  );
}
