import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { useTeam } from "@lakeze/shared/components/team/TeamContext";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { Textarea } from "@lakeze/shared/components/ui/textarea";
import { Badge } from "@lakeze/shared/components/ui/badge";

import { Switch } from "@lakeze/shared/components/ui/switch";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@lakeze/shared/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lakeze/shared/components/ui/select";
import { toast } from "sonner";
import { cn } from "@lakeze/shared/lib/utils";
import PerformanceTemplatesSection, { type PerformanceTemplatesHandle } from "@/components/team/PerformanceTemplatesSection";
import PerformanceSourceRulesSection from "@/components/team/PerformanceSourceRulesSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lakeze/shared/components/ui/tabs";
import CronHealthTab from "@/components/team/CronHealthTab";


interface Accommodation {
  id: string;
  name: string;
}

interface FlagsRow {
  accommodation_id: string;
  has_franchise: boolean;
}

interface SettingsRow {
  accommodation_id: string;
  enabled: boolean;
  notify_time: string;
  show_general_booking: boolean;
  general_booking_target: number | null;
  show_franchise_sales: boolean;
  franchise_sales_target: number | null;
  franchise_sales_year_target: number | null;
  show_franchise_booking: boolean;
  franchise_booking_target: number | null;
  email_template: string | null;
}

const DEFAULT_SETTINGS: Omit<SettingsRow, "accommodation_id"> = {
  enabled: false,
  notify_time: "23:30",
  show_general_booking: true,
  general_booking_target: 400000,
  show_franchise_sales: false,
  franchise_sales_target: 6000000,
  franchise_sales_year_target: 24000000,
  show_franchise_booking: false,
  franchise_booking_target: 300000,
  email_template: "",
};

const TIME_OPTIONS = (() => {
  const arr: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      arr.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return arr;
})();

const GENERAL_TEMPLATE_VARS = [
  "{日期}",
  "{民宿名稱}",
  "{M}",
  "{今日訂單筆數}",
  "{今日訂單}",
  "{今日取消筆數}",
  "{今日取消金額}",
  "{月累積}",
  "{月目標}",
  "{達成率}",
  "{前月累積}",
  "{年度累積}",
  "{今日來源明細}",
  "{本月來源明細}",
];

const FRANCHISE_TEMPLATE_VARS = [
  "{今日加盟銷售}",
  "{加盟月累積}",
  "{加盟月目標}",
  "{加盟月達成率}",
  "{加盟年累積}",
  "{加盟年達成率}",
  "{今日加盟訂房}",
  "{今日加盟訂房筆數}",
  "{加盟訂房月累積}",
  "{加盟訂房月目標}",
  "{加盟訂房達成率}",
  "{加盟訂房年累積}",
];

const GENERAL_TEMPLATE = `{日期}
【{民宿名稱}進單業績】

今日訂單：{今日訂單筆數} 筆，金額 {今日訂單}
今日訂單取消：{今日取消筆數} 筆，金額 {今日取消金額}

{今日來源明細}

本月累積訂房業績：{月累積}
目標訂房業績：{月目標}／月
本月({M}月)訂房達成率：{達成率}%

前月累積訂房業績：{前月累積}
年度累積訂房金額：{年度累積}`;

const FRANCHISE_TEMPLATE = `{日期}
【{民宿名稱}特許加盟紀錄報表】

今日特許加盟銷售：{今日加盟銷售}
本月累積銷售額：{加盟月累積}
目標月銷售：{加盟月目標}/月

本月銷售達成率({加盟月目標})：{加盟月達成率}%
累積銷售業績：{加盟年累積}
累積銷售達成率({加盟年目標})：{加盟年達成率}%
-------------
今日特許加盟訂房業績：{今日加盟訂房筆數} 筆，金額 {今日加盟訂房}萬
本月累積訂房業績：{加盟訂房月累積}
目標特許加盟訂房：{加盟訂房月目標}/月
本月累積訂房達成率：{加盟訂房達成率}%

特許加盟年度累積訂房金額：{加盟訂房年累積}
------------
【{民宿名稱}進單業績】

今日一般訂房業績：{今日訂單筆數} 筆，金額 {今日訂單}

{今日來源明細}

本月累積訂房業績：{月累積}
目標訂房業績：{月目標}／月
本月({M}月)累積訂房達成率：{達成率}%

年度累積訂房金額：{年度累積}`;

const buildDefaultTemplate = (hasFranchise: boolean) =>
  hasFranchise ? FRANCHISE_TEMPLATE : GENERAL_TEMPLATE;


export default function TeamNotification() {
  const { roles } = useTeam();
  const canAccess =
    roles.includes("super_admin") ||
    roles.includes("admin") ||
    roles.includes("am");

  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [flags, setFlags] = useState<Record<string, FlagsRow>>({});
  const [settingsMap, setSettingsMap] = useState<Record<string, SettingsRow>>({});
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("settings");
  const [saving, setSaving] = useState(false);
  // 手動補發
  const [backfillFrom, setBackfillFrom] = useState<string>("");
  const [backfillTo, setBackfillTo] = useState<string>("");
  const [backfillScope, setBackfillScope] = useState<string>("all");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillForceLine, setBackfillForceLine] = useState(false);
  const [backfillLog, setBackfillLog] = useState<string[]>([]);

  const runBackfill = async () => {
    if (!backfillFrom || !backfillTo) {
      toast.error("請選擇補發起訖日期");
      return;
    }
    if (backfillFrom > backfillTo) {
      toast.error("起始日期不可晚於結束日期");
      return;
    }
    const dates: string[] = [];
    for (
      let d = new Date(`${backfillFrom}T00:00:00Z`);
      d <= new Date(`${backfillTo}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      dates.push(d.toISOString().slice(0, 10));
      if (dates.length > 62) break;
    }
    setBackfilling(true);
    setBackfillLog([]);
    const logs: string[] = [];
    for (const date of dates) {
      const { data, error } = await supabase.functions.invoke("send-daily-performance", {
        body: {
          backfill: true,
          test_date: date,
          ...(backfillForceLine ? { force_line: true } : {}),
          ...(backfillScope !== "all" ? { accommodation_id: backfillScope } : {}),
        },
      });
      if (error) {
        logs.push(`${date}：失敗（${error.message}）`);
      } else {
        const results: any[] = data?.results ?? [];
        const skipped = results.filter((r) => r.error === "duplicate_skipped").length;
        const failed = results.filter((r) => !r.ok);
        const sent = results.length - skipped - failed.length;
        logs.push(
          `${date}：已補發 ${sent} 館` +
            (skipped ? `、已送過略過 ${skipped} 館` : "") +
            (failed.length ? `、失敗 ${failed.length} 館（${failed[0].error}）` : ""),
        );
      }
      setBackfillLog([...logs]);
    }
    setBackfilling(false);
    toast.success("補發作業完成");
  };


  

  useEffect(() => {
    if (!canAccess) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  const loadAll = async () => {
    const [accRes, flagRes, setRes] = await Promise.all([
      supabase.from("accommodation_info").select("id,name").order("name"),
      supabase.from("accommodation_info_flags").select("accommodation_id,has_franchise,has_starlink"),
      supabase.from("performance_notification_settings").select("*"),
    ]);
    if (accRes.error) return toast.error("載入館別失敗");
    const accs = (accRes.data || []) as Accommodation[];
    setAccommodations(accs);
    const fMap: Record<string, FlagsRow> = {};
    ((flagRes.data || []) as FlagsRow[]).forEach((f) => (fMap[f.accommodation_id] = f));
    setFlags(fMap);
    const sMap: Record<string, SettingsRow> = {};
    ((setRes.data || []) as SettingsRow[]).forEach((s) => (sMap[s.accommodation_id] = s));
    setSettingsMap(sMap);
    if (accs.length > 0 && !selectedId) setSelectedId(accs[0].id);
  };

  const current = useMemo<SettingsRow | null>(() => {
    if (!selectedId) return null;
    return (
      settingsMap[selectedId] || {
        accommodation_id: selectedId,
        ...DEFAULT_SETTINGS,
      }
    );
  }, [selectedId, settingsMap]);

  const currentFlags = selectedId ? flags[selectedId] : undefined;
  const hasFranchise = !!currentFlags?.has_franchise;

  const patchCurrent = (patch: Partial<SettingsRow>) => {
    if (!selectedId) return;
    setSettingsMap((prev) => ({
      ...prev,
      [selectedId]: {
        ...(prev[selectedId] || { accommodation_id: selectedId, ...DEFAULT_SETTINGS }),
        ...patch,
      },
    }));
  };

  const templatesRef = useRef<PerformanceTemplatesHandle>(null);

  const handleSave = async () => {
    if (!current) return;
    setSaving(true);
    const payload = {
      accommodation_id: current.accommodation_id,
      enabled: current.enabled,
      notify_time: current.notify_time,
      show_general_booking: true,
      general_booking_target: current.general_booking_target,
      show_franchise_sales: hasFranchise,
      franchise_sales_target: hasFranchise ? current.franchise_sales_target : null,
      franchise_sales_year_target: hasFranchise ? current.franchise_sales_year_target : null,
      show_franchise_booking: hasFranchise,
      franchise_booking_target: hasFranchise ? current.franchise_booking_target : null,

      email_template: current.email_template,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("performance_notification_settings")
      .upsert(payload, { onConflict: "accommodation_id" });
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    const tplOk = await templatesRef.current?.save();
    if (tplOk === false) return;
    toast.success("已儲存");
    await loadAll();
  };


  const toggleFlag = async (accId: string, field: "has_franchise", value: boolean) => {
    const existing = flags[accId];
    const payload = {
      accommodation_id: accId,
      has_franchise: field === "has_franchise" ? value : (existing?.has_franchise ?? false),
      updated_at: new Date().toISOString(),
    };
    setFlags((prev) => ({ ...prev, [accId]: { ...payload } as FlagsRow }));
    const { error } = await supabase
      .from("accommodation_info_flags")
      .upsert(payload, { onConflict: "accommodation_id" });
    if (error) {
      toast.error("更新失敗：" + error.message);
      void loadAll();
    } else {
      toast.success("已更新");
    }
  };

  if (!canAccess) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">業績通報設定</h2>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            您沒有權限訪問此頁面
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">業績通報設定</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">通報設定</TabsTrigger>
          <TabsTrigger value="sources">業績推播來源設定</TabsTrigger>
          <TabsTrigger value="cron">功能狀態查詢</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">

      <Card>
        <CardContent className="py-4 text-sm space-y-2 text-muted-foreground">
          <p><span className="font-semibold text-foreground">「本月累積訂房業績」</span>＝本月「成交」的訂單全額</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-medium text-foreground">時間口徑：</span>以落在本月為準 → 看訂單「什麼時候成交/下單」</li>
            <li><span className="font-medium text-foreground">金額歸屬：</span>整張訂單的全額計入該月，不會依入住夜數拆分</li>
            <li><span className="font-medium text-foreground">篩選：</span>排除保留單、取消單（天送另排除團媽/票卷訂房）</li>
            <li>邏輯與 PMS「成交大師」列表一致</li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* Left list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">館別列表</CardTitle>
          </CardHeader>
          <CardContent className="p-2 space-y-1 max-h-[70vh] overflow-auto">
            {accommodations.map((a) => {
              const s = settingsMap[a.id];
              const enabled = !!s?.enabled;
              const active = selectedId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-md text-left text-sm transition-colors",
                    active ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <span className="truncate">{a.name}</span>
                  <Badge variant={enabled ? "success" : "secondary"} className="shrink-0 ml-2">
                    {enabled ? "啟用" : "停用"}
                  </Badge>
                </button>
              );
            })}
            {accommodations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">無資料</p>
            )}
          </CardContent>
        </Card>

        {/* Right settings */}
        <Card>
          {current ? (
            <>
              <CardHeader>
                <CardTitle className="text-base">
                  {accommodations.find((a) => a.id === selectedId)?.name} — 通報設定
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic */}
                <section className="space-y-4">
                  <h3 className="font-semibold">基本設定</h3>
                  <div className="flex items-center justify-between">
                    <Label>啟用每日通報</Label>
                    <Switch
                      checked={current.enabled}
                      onCheckedChange={(v) => patchCurrent({ enabled: v })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>通報時間</Label>
                    <Select
                      value={current.notify_time}
                      onValueChange={(v) => patchCurrent({ notify_time: v })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {TIME_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      ⚠️ 注意：通報時間為系統發送 Email 的時間。LINE 群收到訊息因轉接關係，實際時間可能延遲數分鐘，屬正常現象。
                    </p>
                  </div>
                </section>

                {/* Content */}
                <section className="space-y-4">
                  <h3 className="font-semibold">通報內容設定</h3>

                  <div className="space-y-2 border rounded-md p-3">
                    <Label className="text-sm font-medium">一般訂房業績</Label>
                    <div className="space-y-1">
                      <Label className="text-xs">月目標金額</Label>
                      <Input
                        type="number"
                        value={current.general_booking_target ?? ""}
                        onChange={(e) =>
                          patchCurrent({
                            general_booking_target: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>

                  {hasFranchise && (
                    <>
                      <div className="space-y-2 border rounded-md p-3">
                        <Label className="text-sm font-medium">特許加盟銷售</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">月目標銷售</Label>
                            <Input
                              type="number"
                              value={current.franchise_sales_target ?? ""}
                              onChange={(e) =>
                                patchCurrent({
                                  franchise_sales_target:
                                    e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                            />
                            {(!current.franchise_sales_target || current.franchise_sales_target === 0) && (
                              <p className="text-xs text-amber-600">⚠️ 尚未設定月目標銷售，模板中將顯示空值。</p>
                            )}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">年度目標銷售</Label>
                            <Input
                              type="number"
                              value={current.franchise_sales_year_target ?? ""}
                              onChange={(e) =>
                                patchCurrent({
                                  franchise_sales_year_target:
                                    e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                            />
                            {(!current.franchise_sales_year_target || current.franchise_sales_year_target === 0) && (
                              <p className="text-xs text-amber-600">⚠️ 尚未設定年度目標銷售，模板中將顯示空值。</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 border rounded-md p-3">
                        <Label className="text-sm font-medium">特許加盟訂房業績</Label>
                        <div className="space-y-1">
                          <Label className="text-xs">月目標</Label>
                          <Input
                            type="number"
                            value={current.franchise_booking_target ?? ""}
                            onChange={(e) =>
                              patchCurrent({
                                franchise_booking_target:
                                  e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                          />
                          {(!current.franchise_booking_target || current.franchise_booking_target === 0) && (
                            <p className="text-xs text-amber-600">⚠️ 尚未設定月目標，模板中將顯示空值。</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </section>

                {/* Email */}
                <section className="space-y-2">
                  <h3 className="font-semibold">Email 通知</h3>
                  <p className="text-sm text-muted-foreground">
                    Email 固定發送至：<span className="font-mono">service@lakeze.com</span>
                  </p>
                </section>

                {/* Templates（方案 B：多模板） */}
                <PerformanceTemplatesSection
                  ref={templatesRef}
                  accommodationId={selectedId}
                  defaultBody={buildDefaultTemplate(hasFranchise)}
                  templateVars={[...GENERAL_TEMPLATE_VARS, ...(hasFranchise ? FRANCHISE_TEMPLATE_VARS : [])]}
                />



                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={async () => {
                      if (!selectedId) return;
                      const { data, error } = await supabase.functions.invoke("send-daily-performance", {
                        body: { test_mode: true, accommodation_id: selectedId },
                      });
                      if (error) {
                        toast.error("測試發送失敗：" + error.message);
                        return;
                      }
                      const failed = (data?.results || []).find((r: any) => !r.ok);
                      if (failed) {
                        toast.error("測試發送失敗：" + failed.error);
                      } else {
                        toast.success("測試信件已發送");
                      }
                    }}
                  >
                    測試發送
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "儲存中..." : "儲存設定"}
                  </Button>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="py-16 text-center text-muted-foreground">
              請從左側選擇館別
            </CardContent>
          )}
        </Card>
      </div>

      {/* 手動補發 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">手動補發業績通報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            指定日期區間，重新寄送（含 LINE 推播）該日各館業績通報。已成功送出的日期／館別會自動略過，不會重複發送。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>起始日期</Label>
              <Input type="date" value={backfillFrom} onChange={(e) => setBackfillFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>結束日期</Label>
              <Input type="date" value={backfillTo} onChange={(e) => setBackfillTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>範圍</Label>
              <Select value={backfillScope} onValueChange={setBackfillScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部啟用館別</SelectItem>
                  {accommodations.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={runBackfill} disabled={backfilling} className="w-full">
                {backfilling ? "補發中..." : "開始補發"}
              </Button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={backfillForceLine} onCheckedChange={setBackfillForceLine} />
            <span>同時重推 LINE 群組（忽略「已推播」紀錄，適用當初 LINE 其實沒發成功時）</span>
          </label>
          {backfillLog.length > 0 && (
            <div className="rounded-md border p-3 text-sm space-y-1 max-h-60 overflow-auto">
              {backfillLog.map((l, i) => (
                <div key={i} className="tabular-nums">{l}</div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>



      {/* Flags table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">館別特殊屬性</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>館別名稱</TableHead>
                <TableHead className="w-40">有特許加盟業務</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accommodations.map((a) => {
                const f = flags[a.id];
                return (
                  <TableRow key={a.id}>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>
                      <Switch
                        checked={!!f?.has_franchise}
                        onCheckedChange={(v) => toggleFlag(a.id, "has_franchise", v)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          {(() => {
            const enabledAccs = accommodations.filter((a) => settingsMap[a.id]?.enabled);
            const sourceAccId = enabledAccs.some((a) => a.id === selectedId)
              ? selectedId
              : "";
            if (enabledAccs.length === 0) {
              return (
                <Card>
                  <CardContent className="py-12 flex flex-col items-center text-center gap-3">
                    <p className="font-semibold">目前沒有啟用每日通報的館別</p>
                    <p className="text-sm text-muted-foreground max-w-md">
                      這裡只會列出已在「通報設定」開啟「啟用每日通報」的館別。
                      請先到通報設定頁開啟至少一個館別的每日通報，再回來調整業績推播的訂單來源。
                    </p>
                    <Button variant="outline" onClick={() => setActiveTab("settings")}>
                      前往通報設定
                    </Button>
                  </CardContent>
                </Card>
              );
            }
            return (
              <>
                <div className="max-w-xs space-y-1">
                  <Label className="text-xs">館別（僅顯示已啟用每日通報）</Label>
                  <Select value={sourceAccId} onValueChange={setSelectedId}>
                    <SelectTrigger>
                      <SelectValue placeholder="選擇館別" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {enabledAccs.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <PerformanceSourceRulesSection
                  accommodationId={sourceAccId}
                  accommodationName={enabledAccs.find((a) => a.id === sourceAccId)?.name}
                  canEdit={canAccess}
                />
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="cron" className="space-y-4">
          <CronHealthTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
