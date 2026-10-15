/** 總部後台 → 顧客與行銷 → 加購推薦分析（每館每品項：推薦／成交／轉換率，個人層級歸因） */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { AdminPageHeader } from "@lakeze/shared/components/AdminPageHeader";
import { ShoppingBag } from "lucide-react";
import {
  MetricBreakdownTable, defaultFilters, PLATFORM_LABEL,
  type AccommodationOption, type ColumnDef, type Filters,
} from "@/components/headquarters/MetricBreakdownTable";
import {
  useDemoPresentation, AnalyticsModeToggle, DemoControlPanel,
  SHOW_DEMO_CONTROL_PANEL, SHOW_DEMO_SCOPE_NOTES,
} from "@/components/headquarters/DemoPresentationPanel";
import {
  useSharedDemo,
} from "@/components/headquarters/SharedDemoPanel";
import { demoN2Rows, DEMO_N2_NOTES, type DemoN2Row } from "@lakeze/shared/utils/demoPresentation";

interface Row {
  accommodation_id: string | null;
  ref_type: string;
  ref_id: string;
  item_name: string;
  shown: number;
  purchased_qty: number;
}

const ATTR_DAYS = 7;
const SCOPE_NOTES = [
  "推薦總數＝addon_rec_shown 次數（每品項每次曝光計一次；LINE 管家、官網小安）。",
  `成交數量＝addon_purchased 之 metadata.qty 合計，限同一旅客（LINE 以 line_user_id、官網以 session_key）於推薦後 ${ATTR_DAYS} 日內、同館同品項成交者（個人層級歸因）；加購轉換率＝成交數量／推薦總數。分母為 0 顯示「—」。`,
  "加購品項：館別加購（addon_setting）直接顯示品項名稱；行程商品（trip_product）取 trip_products.name。",
  "業者依事件 accommodation_id 對應館名，無則歸「平台（未指定館別）」。",
  "排除 is_internal=true、測試帳號排除名單與其訂單。全部由 ai_metric_events 真實事件即時彙總，不回填、不模擬。日期以台北時區計。",
];

export default function AddonRecAnalytics() {
  const [accommodations, setAccommodations] = useState<AccommodationOption[]>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demo = useDemoPresentation(accommodations);
  const demoMode = demo.mode === "demo";
  const sharedMode = demo.mode === "shared";
  const shared = useSharedDemo(accommodations, sharedMode);

  useEffect(() => {
    void supabase.from("accommodation_info").select("id, name").eq("is_active", true).order("name")
      .then(({ data }) => setAccommodations((data as AccommodationOption[]) ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.rpc("ai_metric_addon_breakdown" as any, {
      p_from: filters.from, p_to: filters.to,
      p_accommodation_ids: filters.accommodationIds.length ? filters.accommodationIds : null,
      p_channel: filters.channel === "all" ? null : filters.channel,
      p_attribution_days: ATTR_DAYS,
      p_include_internal: filters.includeInternal,
    } as any);
    if (error) { setError(`${(error as any).code ? `[${(error as any).code}] ` : ""}${error.message}${(error as any).details ? ` — ${(error as any).details}` : ""}`); setRows([]); }
    else setRows(((data as any[]) ?? []).map((r) => ({ ...r, shown: Number(r.shown), purchased_qty: Number(r.purchased_qty) })));
    setLoading(false);
  }, [filters]);
  // 紀錄模式不呼叫任何即時 RPC，正式資料路徑完全不變
  useEffect(() => { if (demo.mode === "live") void load(); }, [load, demo.mode]);

  const nameOf = (id: string | null) => (id ? accommodations.find((a) => a.id === id)?.name ?? id.slice(0, 8) : PLATFORM_LABEL);

  const columns: ColumnDef<Row>[] = [
    { key: "venue", label: "業者名稱", kind: "text", value: (r) => nameOf(r.accommodation_id) },
    { key: "item", label: "加購品項", kind: "text", value: (r) => `${r.item_name}${r.ref_type === "trip_product" ? "（行程商品）" : ""}` },
    { key: "shown", label: "推薦總數", kind: "number", value: (r) => r.shown },
    { key: "qty", label: "成交數量", kind: "number", value: (r) => r.purchased_qty },
    { key: "cvr", label: "加購轉換率%", kind: "rate", num: (r) => r.purchased_qty, den: (r) => r.shown },
  ];

  const demoRows = useMemo<DemoN2Row[]>(
    () => (demo.run
      ? demoN2Rows(demo.run, demo.names, {
        from: filters.from, to: filters.to,
        venueIds: filters.accommodationIds, channel: filters.channel,
      })
      : []),
    [demo.run, demo.names, filters.from, filters.to, filters.accommodationIds, filters.channel],
  );

  const demoColumns: ColumnDef<DemoN2Row>[] = [
    { key: "venue", label: "業者名稱", kind: "text", value: (r) => r.venueName },
    { key: "campaign", label: "活動名稱", kind: "text", value: (r) => r.campaignName },
    { key: "item", label: "加購品項", kind: "text", value: (r) => r.itemName },
    { key: "shown", label: "推薦總數", kind: "number", value: (r) => r.shown },
    { key: "qty", label: "成交數量", kind: "number", value: (r) => r.purchasedQty },
    { key: "cvr", label: "加購轉換率%（數量／推薦）", kind: "rate", num: (r) => r.purchasedQty, den: (r) => r.shown },
  ];

  const sharedRows = useMemo(
    () => (shared.run && shared.dataset
      ? demoN2Rows(shared.run, shared.dataset.names, {
        from: filters.from, to: filters.to,
        venueIds: filters.accommodationIds, channel: filters.channel,
      })
      : []),
    [shared.run, shared.dataset, filters.from, filters.to, filters.accommodationIds, filters.channel],
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title="加購推薦分析" description="AI 管家加購推薦曝光與推薦後成交（個人層級歸因），每館每品項一列" icon={ShoppingBag} />
      <div className="flex flex-wrap items-center gap-3">
        <AnalyticsModeToggle mode={demo.mode} onChange={demo.setMode} />
      </div>
      {demo.mode === "live" && (
        <p className="text-xs text-muted-foreground" data-testid="addon-scenario-entry">
          本頁為實際營運資料。歸因邏輯的情境驗證請見
          <Link to="/hq/scenario-validation" className="mx-1 underline">N1／N2 情境驗證（隔離模擬器）</Link>
          ，該頁為情境測試資料、非實際營運成果。
        </p>
      )}
      {sharedMode ? (
        <>
          {shared.showTable && (
            <MetricBreakdownTable
              title="加購推薦明細"
              description={`資料來源：共用資料集 revision ${shared.dataset?.revision}`}
              scopeNotes={[]}
              columns={demoColumns}
              rows={sharedRows}
              rowKey={(r) => r.key}
              loading={false}
              error={null}
              filters={filters}
              onFiltersChange={setFilters}
              onReload={() => void shared.load()}
              accommodations={accommodations}
              channelOptions={[{ value: "all", label: "全部" }, { value: "web", label: "web" }, { value: "line", label: "line" }]}
              csvFileName="addon-rec-analytics-shared"
              showIncludeInternal={false}
            />
          )}
        </>
      ) : demoMode ? (
        <>
          {SHOW_DEMO_CONTROL_PANEL && <DemoControlPanel
            track="N2"
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
            title="加購推薦明細（紀錄）"
            description="資料來源：本機事件資料集（前端計算），未讀取 ai_metric_events 或任何即時 RPC"
            scopeNotes={SHOW_DEMO_SCOPE_NOTES ? DEMO_N2_NOTES : []}
            columns={demoColumns}
            rows={demoRows}
            rowKey={(r) => r.key}
            loading={false}
            error={null}
            filters={filters}
            onFiltersChange={setFilters}
            onReload={demo.refresh}
            accommodations={accommodations}
            channelOptions={[{ value: "all", label: "全部" }, { value: "web", label: "web" }, { value: "line", label: "line" }]}
            csvFileName="addon-rec-analytics-record"
            showIncludeInternal={false}
          />
        </>
      ) : (
        <MetricBreakdownTable
          title="加購推薦明細"
          description="資料來源：ai_metric_events（addon_rec_shown／addon_purchased）"
          scopeNotes={SCOPE_NOTES}
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.accommodation_id ?? "null"}:${r.ref_type}:${r.ref_id}`}
          loading={loading}
          error={error}
          filters={filters}
          onFiltersChange={setFilters}
          onReload={() => void load()}
          accommodations={accommodations}
          channelOptions={[{ value: "all", label: "全部" }, { value: "web", label: "web" }, { value: "line", label: "line" }]}
          csvFileName="addon-rec-analytics"
        />
      )}
    </div>
  );
}
