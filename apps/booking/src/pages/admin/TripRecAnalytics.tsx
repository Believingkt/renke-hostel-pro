/** 總部後台 → 行程引擎 → 行程推薦分析（每館每行程：曝光／點擊／複製收藏分享） */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { AdminPageHeader } from "@lakeze/shared/components/AdminPageHeader";
import { Route } from "lucide-react";
import {
  MetricBreakdownTable, defaultFilters, PLATFORM_LABEL,
  type AccommodationOption, type ColumnDef, type Filters,
} from "@/components/headquarters/MetricBreakdownTable";

interface Row {
  accommodation_id: string | null;
  ref_id: string;
  ref_source: "trip" | "generation" | null;
  title_zh: string | null;
  shown: number; clicks: number; engagements: number;
  copies: number; saves: number; favorites: number; shares: number;
}

const SCOPE_NOTES = [
  "被點擊數＝被點擊過的曝光數：新資料以曝光編號 rec_id 一一對應（count(DISTINCT rec_id)，點擊對不到曝光者不計）；舊資料無 rec_id，依「同旅客＋同日」去重後以該列曝光數為上限，故被點擊率必 ≤100%。",
  "複製／收藏／分享各自以 rec_id 去重（舊資料每種動作以曝光數為上限）後相加；同一次推薦可同時被複製、收藏、分享，故「複製/收藏/分享比例」可能超過 100%。",
  "行程名稱依 ref_id 取 trips.title → trip_generations 標題 → 事件 metadata，皆無則顯示 ID 前 8 碼；來源「上架行程／AI 生成」。",
  "本表僅列有館別歸屬之行程；全平台（含未指定館別）數字請見 AI 成效指標頁。",
  "平台入口（官網首頁小安、導引頁）之事件，依行程所屬館別歸列。",
  "已上架但期間內尚無任何曝光的行程仍會列出（推薦總數 0、來源「上架行程」、比率顯示「—」），有數字的列排前面、0 值列排後面。",
  "統計僅在計算時歸因，原始事件一律不刪、不改、不回填。",
];

export default function TripRecAnalytics() {
  const [accommodations, setAccommodations] = useState<AccommodationOption[]>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.from("accommodation_info").select("id, name").eq("is_active", true).order("name")
      .then(({ data }) => setAccommodations((data as AccommodationOption[]) ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.rpc("ai_metric_trip_breakdown" as any, {
      p_from: filters.from, p_to: filters.to,
      p_accommodation_ids: filters.accommodationIds.length ? filters.accommodationIds : null,
      p_channel: filters.channel === "all" ? null : filters.channel,
      p_include_internal: true,
    } as any);
    if (error) { setError(`${(error as any).code ? `[${(error as any).code}] ` : ""}${error.message}${(error as any).details ? ` — ${(error as any).details}` : ""}`); setRows([]); }
    else setRows(((data as any[]) ?? []).map((r) => ({
      ...r,
      shown: Number(r.shown), clicks: Number(r.clicks), engagements: Number(r.engagements),
      copies: Number(r.copies), saves: Number(r.saves), favorites: Number(r.favorites), shares: Number(r.shares),
    })));
    setLoading(false);
  }, [filters]);
  useEffect(() => { void load(); }, [load]);

  const nameOf = (id: string | null) => (id ? accommodations.find((a) => a.id === id)?.name ?? id.slice(0, 8) : PLATFORM_LABEL);
  const tripName = (r: Row) => r.title_zh?.trim() || r.ref_id.slice(0, 8);

  const columns: ColumnDef<Row>[] = [
    { key: "venue", label: "業者名稱", kind: "text", value: (r) => nameOf(r.accommodation_id) },
    { key: "trip", label: "行程名稱", kind: "text", value: tripName },
    { key: "source", label: "來源", kind: "text", value: (r) => (r.ref_source === "trip" ? "上架行程" : r.ref_source === "generation" ? "AI 生成" : "—") },
    { key: "shown", label: "推薦總數", kind: "number", value: (r) => r.shown },
    { key: "clicks", label: "被點擊數", kind: "number", value: (r) => r.clicks },
    { key: "ctr", label: "被點擊率%", kind: "rate", num: (r) => r.clicks, den: (r) => r.shown },
    { key: "eng", label: "複製/收藏/分享數", kind: "number", value: (r) => r.engagements },
    { key: "engRate", label: "複製/收藏/分享比例%", kind: "rate", num: (r) => r.engagements, den: (r) => r.shown },
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader title="行程推薦分析" description="AI 行程卡曝光、點擊與互動（複製／收藏／分享）成效，每館每行程一列" icon={Route} />
      <MetricBreakdownTable
        title="行程推薦明細"
        description="資料來源：ai_metric_events（LINE 管家、官網小安、電腦版管家、行程產生頁）"
        scopeNotes={SCOPE_NOTES}
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.accommodation_id ?? "null"}:${r.ref_id}`}
        loading={loading}
        error={error}
        filters={filters}
        onFiltersChange={setFilters}
        onReload={() => void load()}
        accommodations={accommodations}
        channelOptions={[{ value: "all", label: "全部" }, { value: "web", label: "web" }, { value: "line", label: "line" }]}
        csvFileName="trip-rec-analytics"
        showIncludeInternal={false}
      />
    </div>
  );
}
