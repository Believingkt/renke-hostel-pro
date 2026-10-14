/** 總部後台 → 顧客與行銷 → 再行銷轉換分析（每活動每通路：發送／點擊／下房） */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { AdminPageHeader } from "@lakeze/shared/components/AdminPageHeader";
import { Send } from "lucide-react";
import {
  MetricBreakdownTable, defaultFilters,
  type AccommodationOption, type ColumnDef, type Filters,
} from "@/components/headquarters/MetricBreakdownTable";
import {
  useDemoPresentation, AnalyticsModeToggle, DemoControlPanel,
  SHOW_DEMO_CONTROL_PANEL, SHOW_DEMO_SCOPE_NOTES,
} from "@/components/headquarters/DemoPresentationPanel";
import { demoN1Rows, DEMO_N1_NOTES, type DemoN1Row } from "@lakeze/shared/utils/demoPresentation";

interface Row {
  accommodation_id: string | null;
  campaign_id: string;
  campaign_name: string;
  channel: string;
  sends: number; clicks: number; orders: number;
  order_venues: string | null;
}

const SCOPE_NOTES = [
  "發送數＝remarketing_sends 中 status='sent' 且 is_test=false 的筆數（無寄達回報，以成功送出近似「實際寄達」）。",
  "LINE 推播目前為人工複製發送（狀態 skipped），無寄達紀錄，不計入發送數；其追蹤連結點擊仍會記錄。",
  "點擊數＝上述發送中 clicked_at 不為空者；點擊率＝點擊數／發送數。",
  "下房數＝以 order_attributions utm_source=remarketing 且 utm_content＝發送 ID（last 或 first touch）對應、訂單非取消／保留且在寄送之後；每筆發送最多計 1 單；轉換率＝下房數／發送數。分母為 0 顯示「—」。",
  "業者＝活動設定之館別（remarketing_campaigns.content.accommodation_id），未指定者歸「全平台」；「下房館別」欄列出該列實際成交訂單所屬館別與筆數。",
  "排除測試帳號排除名單（Email 對應收件人、旅客檔、訂單 Email）。全部由真實發送與訂單即時彙總，不回填、不模擬。日期以寄送時間（台北時區）計。",
];

const CHANNEL_LABEL: Record<string, string> = { email: "Email", line_share: "LINE", line: "LINE" };

export default function RemarketingAnalytics() {
  const [accommodations, setAccommodations] = useState<AccommodationOption[]>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demo = useDemoPresentation(accommodations);
  const demoMode = demo.mode === "demo";

  useEffect(() => {
    void supabase.from("accommodation_info").select("id, name").eq("is_active", true).order("name")
      .then(({ data }) => setAccommodations((data as AccommodationOption[]) ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.rpc("ai_metric_remarketing_breakdown" as any, {
      p_from: filters.from, p_to: filters.to,
      p_accommodation_ids: filters.accommodationIds.length ? filters.accommodationIds : null,
      p_channel: filters.channel === "all" ? null : filters.channel,
      p_include_internal: filters.includeInternal,
    } as any);
    if (error) { setError(`${(error as any).code ? `[${(error as any).code}] ` : ""}${error.message}${(error as any).details ? ` — ${(error as any).details}` : ""}`); setRows([]); }
    else setRows(((data as any[]) ?? []).map((r) => ({ ...r, sends: Number(r.sends), clicks: Number(r.clicks), orders: Number(r.orders) })));
    setLoading(false);
  }, [filters]);
  // 紀錄模式不呼叫任何即時 RPC，正式資料路徑完全不變
  useEffect(() => { if (!demoMode) void load(); }, [load, demoMode]);

  const nameOf = (id: string | null) => (id ? accommodations.find((a) => a.id === id)?.name ?? id.slice(0, 8) : "全平台");

  const columns: ColumnDef<Row>[] = [
    { key: "venue", label: "業者名稱", kind: "text", value: (r) => nameOf(r.accommodation_id) },
    { key: "campaign", label: "活動名稱", kind: "text", value: (r) => r.campaign_name },
    { key: "channel", label: "通路", kind: "text", value: (r) => CHANNEL_LABEL[r.channel] ?? r.channel },
    { key: "sends", label: "發送數", kind: "number", value: (r) => r.sends },
    { key: "clicks", label: "點擊數", kind: "number", value: (r) => r.clicks },
    { key: "ctr", label: "點擊率%", kind: "rate", num: (r) => r.clicks, den: (r) => r.sends },
    { key: "orders", label: "下房數", kind: "number", value: (r) => r.orders },
    { key: "cvr", label: "轉換率%", kind: "rate", num: (r) => r.orders, den: (r) => r.sends },
    { key: "venues", label: "下房館別", kind: "text", value: (r) => r.order_venues ?? "—" },
  ];

  const demoRows = useMemo<DemoN1Row[]>(
    () => (demo.run
      ? demoN1Rows(demo.run, demo.names, {
        from: filters.from, to: filters.to,
        venueIds: filters.accommodationIds, channel: filters.channel,
      })
      : []),
    [demo.run, demo.names, filters.from, filters.to, filters.accommodationIds, filters.channel],
  );

  const demoColumns: ColumnDef<DemoN1Row>[] = [
    { key: "venue", label: "業者名稱", kind: "text", value: (r) => r.venueName },
    { key: "campaign", label: "活動名稱", kind: "text", value: (r) => r.campaignName },
    { key: "channel", label: "通路", kind: "text", value: (r) => r.channelLabel },
    { key: "sends", label: "發送數", kind: "number", value: (r) => r.sends },
    { key: "clicks", label: "點擊數（有效）", kind: "number", value: (r) => r.clicks },
    { key: "skipped", label: "skipped 點擊", kind: "number", value: (r) => r.skippedClicks },
    { key: "ctr", label: "點擊率%", kind: "rate", num: (r) => r.clicks, den: (r) => r.sends },
    { key: "orders", label: "下房數", kind: "number", value: (r) => r.orders },
    { key: "cvr", label: "轉換率%（下房／發送，合計分子／合計分母）", kind: "rate", num: (r) => r.orders, den: (r) => r.sends },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader title="再行銷轉換分析" description="AI 再行銷推播的寄達、點擊與下房轉換，每活動每通路一列（以活動設定館別歸屬）" icon={Send} />
      <div className="flex flex-wrap items-center gap-3">
        <AnalyticsModeToggle mode={demo.mode} onChange={demo.setMode} />
        <span className="text-xs text-muted-foreground">
          {demoMode ? "紀錄：本機事件資料集，不呼叫即時 RPC、不與即時總計混用。" : "即時：資料來自正式 RPC 即時彙總。"}
        </span>
      </div>
      {!demoMode && (
        <p className="text-xs text-muted-foreground" data-testid="remarketing-scenario-entry">
          本頁為實際營運資料。歸因邏輯的情境驗證請見
          <Link to="/hq/scenario-validation" className="mx-1 underline">N1／N2 情境驗證（隔離模擬器）</Link>
          ，該頁為情境測試資料、非實際營運成果。
        </p>
      )}
      {demoMode ? (
        <>
          {SHOW_DEMO_CONTROL_PANEL && <DemoControlPanel
            track="N1"
            run={demo.run}
            names={demo.names}
            onNamesChange={demo.updateNames}
            onGenerate={demo.generate}
            onClear={demo.clear}
            storeMode={demo.storeMode}
            recovered={demo.recovered}
            staleVersion={demo.staleVersion}
            canGenerate={accommodations.length > 0}
          />}
          <MetricBreakdownTable
            title="再行銷轉換明細（紀錄）"
            description="資料來源：本機事件資料集（前端計算），未讀取任何即時行銷表或 RPC"
            scopeNotes={SHOW_DEMO_SCOPE_NOTES ? DEMO_N1_NOTES : []}
            columns={demoColumns}
            rows={demoRows}
            rowKey={(r) => r.key}
            loading={false}
            error={null}
            filters={filters}
            onFiltersChange={setFilters}
            onReload={demo.refresh}
            accommodations={accommodations}
            channelOptions={[{ value: "all", label: "全部" }, { value: "email", label: "Email" }, { value: "line_share", label: "LINE" }]}
            csvFileName="remarketing-analytics-record"
            showIncludeInternal={false}
          />
        </>
      ) : (
        <MetricBreakdownTable
          title="再行銷轉換明細"
          description="資料來源：remarketing_sends、remarketing_campaigns、order_attributions、orders"
          scopeNotes={SCOPE_NOTES}
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.accommodation_id ?? "null"}:${r.campaign_id}:${r.channel}`}
          loading={loading}
          error={error}
          filters={filters}
          onFiltersChange={setFilters}
          onReload={() => void load()}
          accommodations={accommodations}
          channelOptions={[{ value: "all", label: "全部" }, { value: "email", label: "Email" }, { value: "line_share", label: "LINE" }]}
          csvFileName="remarketing-analytics"
        />
      )}
    </div>
  );
}
