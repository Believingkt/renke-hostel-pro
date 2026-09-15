import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, ShoppingBag, MessagesSquare, Brain, Clock, Megaphone, AlertTriangle,
} from "lucide-react";

interface Props {
  accommodationId: string;
}

type RangeKey = "month" | "3m" | "6m";

const RANGE_LABEL: Record<RangeKey, string> = { month: "本月", "3m": "近 3 月", "6m": "近 6 月" };

interface AnalyticsPayload {
  top_products: { name: string; qty: number; revenue: number }[];
  funnel: { sessions_total: number; sessions_room: number; sessions_checkout: number };
  orders_total: number;
  monthly: { ym: string; orders: number; revenue: number }[];
  addon: { total_orders: number; addon_orders: number };
  conversations_total: number;
  intents: { intent: string; cnt: number }[];
  conv_success: { total_sessions: number; converted_sessions: number };
  evals: { labeled: number; correct_cnt: number; ok_cnt: number; fix_cnt: number };
  discount: { discount_orders: number; discount_revenue: number; discount_given: number };
  top_codes: { code: string; orders: number; revenue: number }[];
  repurchase: { ym: string; buyers: number; repeat_buyers: number }[];
}

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--muted-foreground))",
];

const MIN_EVAL_SAMPLES = 30;

/** 口徑註記 */
const Caliber = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">口徑：{children}</p>
);

const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
const fmtMoney = (v: number) => `NT$ ${Math.round(v).toLocaleString()}`;

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: 12,
};

function rangeToDates(range: RangeKey) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  if (range === "month") {
    start.setDate(1);
  } else {
    start.setMonth(start.getMonth() - (range === "3m" ? 3 : 6));
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export default function SalesServiceAnalyticsTab({ accommodationId }: Props) {
  const [range, setRange] = useState<RangeKey>("3m");
  const [minutesPerChat, setMinutesPerChat] = useState(5);
  const [hourlyWage, setHourlyWage] = useState(250);

  const { start, end } = useMemo(() => rangeToDates(range), [range]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-service-analytics", accommodationId, range],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_sales_service_analytics", {
        p_accommodation_id: accommodationId,
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      });
      if (error) throw error;
      return data as AnalyticsPayload;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-56 w-full" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        無法載入成效資料{error ? `：${(error as any).message}` : ""}
      </CardContent></Card>
    );
  }

  /* ---- 衍生指標 ---- */
  const funnelData = [
    { stage: "造訪首頁 / 任一頁", value: data.funnel.sessions_total ?? 0 },
    { stage: "瀏覽房型 / 方案", value: data.funnel.sessions_room ?? 0 },
    { stage: "進入訂房 / 結帳", value: data.funnel.sessions_checkout ?? 0 },
    { stage: "完成訂單", value: data.orders_total ?? 0 },
  ];

  const conversionRate = pct(data.orders_total, data.funnel.sessions_total);
  const addonRate = pct(data.addon.addon_orders, data.addon.total_orders);
  const bookingSuccessRate = pct(data.conv_success.converted_sessions, data.conv_success.total_sessions);

  const evalEnough = data.evals.labeled >= MIN_EVAL_SAMPLES;
  const intentAccuracy = pct(data.evals.correct_cnt, data.evals.labeled);
  const replyAccuracy = pct(data.evals.ok_cnt, data.evals.labeled);

  const savedHours = (data.conversations_total * minutesPerChat) / 60;
  const savedCost = savedHours * hourlyWage;

  const repurchaseData = data.repurchase.map((r) => ({
    ym: r.ym,
    回購率: r.buyers > 0 ? Number(((r.repeat_buyers / r.buyers) * 100).toFixed(1)) : 0,
    下單人數: r.buyers,
  }));

  const monthlyData = data.monthly.map((m) => ({ ym: m.ym, 訂單量: m.orders, 營收: m.revenue }));

  return (
    <div className="space-y-6">
      {/* 時間範圍 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          統計區間：{start.toLocaleDateString("zh-TW")} ~ {end.toLocaleDateString("zh-TW")}
        </p>
        <div className="flex bg-muted rounded-lg p-1">
          {(["month", "3m", "6m"] as RangeKey[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "secondary" : "ghost"}
              className="px-3"
              onClick={() => setRange(r)}
            >
              {RANGE_LABEL[r]}
            </Button>
          ))}
        </div>
      </div>

      {/* 1. 商品瀏覽分析 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" /> 熱門商品 / 房型排行
            </CardTitle>
            <CardDescription>依實際成交房型統計</CardDescription>
          </CardHeader>
          <CardContent>
            {data.top_products.length === 0 ? (
              <p className="text-sm text-muted-foreground">區間內尚無成交房型資料</p>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.top_products.slice(0, 8)} layout="vertical" margin={{ left: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="qty" name="成交間數" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <Caliber>
              以區間內非取消訂單的 order_rooms 房型間數加總排序；不含加購與行程商品。
            </Caliber>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> 瀏覽行為路徑漏斗
            </CardTitle>
            <CardDescription>造訪 → 瀏覽房型 → 進入結帳 → 完成訂單</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnelData.map((f, i) => {
                const top = funnelData[0].value || 1;
                const ratio = Math.max(2, Math.min(100, (f.value / top) * 100));
                return (
                  <div key={f.stage} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{f.stage}</span>
                      <span className="tabular-nums font-medium">
                        {f.value.toLocaleString()}
                        {i > 0 && funnelData[i - 1].value > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {((f.value / funnelData[i - 1].value) * 100).toFixed(1)}%
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-3 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${ratio}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <Caliber>
              前三階段取自 page_analytics 的不重複 session（路徑含 room/package 視為瀏覽房型、含
              book/checkout 視為進入結帳）；最後一階為區間內非取消訂單數，與瀏覽 session 非同一識別碼，屬近似估算。
            </Caliber>
          </CardContent>
        </Card>
      </div>

      {/* 2. 銷售統計 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> 銷售統計
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">區間訂單量</p>
              <p className="text-3xl font-bold tabular-nums">{data.orders_total.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">轉換率</p>
              <p className="text-3xl font-bold tabular-nums">{fmtPct(conversionRate)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                完成訂單 ÷ 不重複瀏覽 session（{data.funnel.sessions_total.toLocaleString()}）
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">加購行為佔比</p>
              <p className="text-3xl font-bold tabular-nums">{fmtPct(addonRate)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {data.addon.addon_orders} / {data.addon.total_orders} 筆訂單含加購
              </p>
            </div>
          </div>

          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="ym" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="訂單量" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Caliber>
            訂單以 order_date 分月、排除已取消訂單；加購佔比以訂單 custom_addon_details 是否有項目判定（含行程商品加購快照）。
            轉換率因訂單與瀏覽 session 無直接關聯，為近似估算。
          </Caliber>
        </CardContent>
      </Card>

      {/* 3. 客服使用數據 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessagesSquare className="h-4 w-4" /> 客服使用數據
            </CardTitle>
            <CardDescription>小安 AI 客服對話統計</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">對話次數</p>
                <p className="text-3xl font-bold tabular-nums">{data.conversations_total.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">成功預約率</p>
                <p className="text-3xl font-bold tabular-nums">{fmtPct(bookingSuccessRate)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {data.conv_success.converted_sessions} / {data.conv_success.total_sessions} 個對話 session
                </p>
              </div>
            </div>
            <Caliber>
              對話次數取自 ai_conversation_logs；成功預約率以「對話 session 首次發生後 24 小時內，該館別出現非取消訂單」估算，
              未逐筆綁定訂單，屬近似估算。
            </Caliber>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">問題類型分布</CardTitle>
            <CardDescription>依對話內容關鍵字歸類</CardDescription>
          </CardHeader>
          <CardContent>
            {data.intents.length === 0 ? (
              <p className="text-sm text-muted-foreground">區間內尚無對話資料</p>
            ) : (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.intents}
                      dataKey="cnt"
                      nameKey="intent"
                      innerRadius={45}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {data.intents.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <Caliber>
              以對話全文關鍵字歸類為 訂房查詢／價格詢問／設施服務／交通位置／取消改期／其他；同一對話僅計一種主要類型。
            </Caliber>
          </CardContent>
        </Card>
      </div>

      {/* 4. AI 回覆成效 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" /> AI 回覆成效
          </CardTitle>
          <CardDescription>取自「模型訓練 → 標註評測」的人工標註樣本</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">意圖辨識正確率</p>
              <p className="text-3xl font-bold tabular-nums">{fmtPct(intentAccuracy)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">標註為「語意正確」比例</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">回覆準確度</p>
              <p className="text-3xl font-bold tabular-nums">{fmtPct(replyAccuracy)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">「正確 + 可接受」比例</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">已標註樣本數</p>
              <p className="text-3xl font-bold tabular-nums">{data.evals.labeled}</p>
              <Badge variant={evalEnough ? "default" : "secondary"} className="mt-2">
                {evalEnough ? "樣本充足" : `建議 ≥ ${MIN_EVAL_SAMPLES} 筆`}
              </Badge>
            </div>
          </div>
          {!evalEnough && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
              樣本不足：目前已標註 {data.evals.labeled} 筆，數值僅供參考，請至「模型訓練 → 標註評測」補足樣本。
            </div>
          )}
          <Caliber>
            即時計算自 ai_eval_samples 全部已標註樣本（不分區間，因標註為模型層級評測）。
          </Caliber>
        </CardContent>
      </Card>

      {/* 5. 節省人力時數 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> 客服節省人力時數估算
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2 w-44">
              <Label>每通對話人工分鐘數</Label>
              <Input
                type="number" min={1} value={minutesPerChat}
                onChange={(e) => setMinutesPerChat(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-2 w-44">
              <Label>人力時薪（NT$）</Label>
              <Input
                type="number" min={1} value={hourlyWage}
                onChange={(e) => setHourlyWage(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">對話數</p>
              <p className="text-3xl font-bold tabular-nums">{data.conversations_total.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">節省時數</p>
              <p className="text-3xl font-bold tabular-nums">{savedHours.toFixed(1)} 小時</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">換算人力成本</p>
              <p className="text-3xl font-bold tabular-nums">{fmtMoney(savedCost)}</p>
            </div>
          </div>
          <Caliber>
            節省時數 = 區間對話數 × 每通對話人工分鐘數 ÷ 60；人力成本 = 節省時數 × 時薪。分鐘數與時薪為可調整之估算參數。
          </Caliber>
        </CardContent>
      </Card>

      {/* 6. 行銷活動成效 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> 折扣碼導流
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">使用折扣碼訂單</p>
                <p className="text-3xl font-bold tabular-nums">{data.discount.discount_orders}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  佔全部訂單 {fmtPct(pct(data.discount.discount_orders, data.orders_total))}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">折扣碼帶來營收</p>
                <p className="text-2xl font-bold tabular-nums">{fmtMoney(data.discount.discount_revenue)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  折抵金額 {fmtMoney(data.discount.discount_given)}
                </p>
              </div>
            </div>
            {data.top_codes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">折扣碼排行</p>
                {data.top_codes.slice(0, 6).map((c) => (
                  <div key={c.code} className="flex items-center justify-between text-sm border-b last:border-0 py-1">
                    <span className="font-mono">{c.code}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {c.orders} 筆 · {fmtMoney(c.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Caliber>
              以訂單上實際帶入的 discount_code 統計（含 KOL 星探折扣碼），排除已取消訂單；營收為訂單成交金額 final_price。
            </Caliber>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">回購率變化（近 3 月）</CardTitle>
          </CardHeader>
          <CardContent>
            {repurchaseData.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無足夠資料</p>
            ) : (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={repurchaseData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="ym" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="回購率" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <Caliber>
              每月「當月下單者中，先前已有非取消訂單者」的比例；顧客識別以會員 ID 優先，無會員則以訂購 Email 比對，
              同一人使用不同 Email 會被視為新客，屬近似估算。
            </Caliber>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
