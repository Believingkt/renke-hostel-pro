import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useMarketingAnalytics, type CampaignPerformance } from "@/hooks/use-marketing-analytics";
import { subDays } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  RefreshCw, TrendingUp, DollarSign, MousePointerClick, ShoppingCart,
  MessageCircle, UserPlus, Info, Target,
} from "lucide-react";

interface Props {
  accommodationId: string;
}

type RangeKey = "7" | "14" | "30" | "90";

const ntd = (n: number) =>
  `NT$ ${Math.round(n).toLocaleString()}`;

const ADVICE_MAP: Record<CampaignPerformance["advice"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scale: { label: "建議加碼", variant: "default" },
  keep: { label: "維持預算", variant: "secondary" },
  watch: { label: "觀察調整", variant: "outline" },
  cut: { label: "建議縮減", variant: "destructive" },
};

const MetricCard = ({ icon: Icon, label, value, hint }: {
  icon: React.ElementType; label: string; value: string; hint?: string;
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardDescription className="flex items-center gap-1">
        <Icon className="h-4 w-4" />
        {label}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </CardContent>
  </Card>
);

export const MarketingAnalyticsTab = ({ accommodationId }: Props) => {
  const [range, setRange] = useState<RangeKey>("30");
  const endDate = new Date();
  const startDate = subDays(endDate, parseInt(range));

  const { data, isLoading, refetch, isFetching } = useMarketingAnalytics({
    accommodationId,
    startDate,
    endDate,
  });

  const topCampaign = data?.campaigns?.find((c) => c.spend > 0 && c.orders > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <p className="text-sm text-muted-foreground">
          追蹤 Meta 廣告成效、LINE@ 成長與訂單歸因，找出真正帶單的廣告。
        </p>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-1">
            {(["7", "14", "30", "90"] as RangeKey[]).map((r) => (
              <Button
                key={r}
                variant={range === r ? "secondary" : "ghost"}
                size="sm"
                className="px-3"
                onClick={() => setRange(r)}
              >
                {r}天
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {!isLoading && data && !data.hasAdData && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>尚未有廣告成效資料</AlertTitle>
          <AlertDescription>
            廣告花費／曝光／點擊需由 Meta 每日同步匯入。設定好同步排程後，這裡會自動出現每支廣告的 ROAS 與預算建議。
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && data && !data.hasAttributionData && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>訂單歸因剛開始累積</AlertTitle>
          <AlertDescription>
            系統已開始記錄訪客的首次接觸與最後點擊來源。請在廣告連結加上
            <code className="mx-1 px-1 rounded bg-muted">?utm_source=meta&amp;utm_campaign=活動名稱&amp;utm_content=廣告名稱</code>
            ，之後成立的訂單就能歸因到對應廣告。
          </AlertDescription>
        </Alert>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={DollarSign} label="廣告花費" value={ntd(data?.spend ?? 0)} hint={`過去 ${range} 天`} />
        <MetricCard icon={ShoppingCart} label="歸因訂單" value={`${data?.attributedOrders ?? 0} 筆`} hint={ntd(data?.attributedRevenue ?? 0)} />
        <MetricCard icon={TrendingUp} label="ROAS" value={(data?.roas ?? 0).toFixed(2)} hint="歸因營收 ÷ 廣告花費" />
        <MetricCard icon={Target} label="每張訂單成本" value={ntd(data?.cpa ?? 0)} hint="CPA" />
        <MetricCard icon={MousePointerClick} label="連結點擊" value={(data?.linkClicks ?? 0).toLocaleString()} hint={`曝光 ${(data?.impressions ?? 0).toLocaleString()}`} />
        <MetricCard icon={MessageCircle} label="廣告訊息互動" value={(data?.messagingStarted ?? 0).toLocaleString()} hint="點擊廣告後開啟對話" />
        <MetricCard icon={UserPlus} label="LINE@ 新好友" value={`${data?.lineFollows ?? 0}`} hint={`封鎖 ${data?.lineUnfollows ?? 0}`} />
        <MetricCard icon={MessageCircle} label="LINE@ 對話數" value={`${data?.lineConversations ?? 0}`} hint="AI 管家對話紀錄" />
      </div>

      {/* 決策建議 */}
      {topCampaign && (
        <Alert>
          <Target className="h-4 w-4" />
          <AlertTitle>本期決定性因素</AlertTitle>
          <AlertDescription>
            <strong>{topCampaign.campaign_name}</strong> 花費 {ntd(topCampaign.spend)}、帶來 {topCampaign.orders} 筆訂單、
            營收 {ntd(topCampaign.revenue)}，ROAS {topCampaign.roas.toFixed(2)}、CPA {ntd(topCampaign.cpa)}。
            {topCampaign.roas >= 3
              ? " 表現優異，建議提高日預算 20–30% 並持續觀察 CPA 是否上升。"
              : topCampaign.roas >= 1
                ? " 尚有獲利，建議維持預算並優化素材與受眾。"
                : " 目前未達損益兩平，建議縮減預算或更換素材。"}
          </AlertDescription>
        </Alert>
      )}

      {/* 每日花費 vs 歸因營收 */}
      {(data?.dailySpendRevenue?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">每日廣告花費 vs 歸因營收</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data!.dailySpendRevenue}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend />
                  <Area type="monotone" dataKey="花費" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2)/0.2)" strokeWidth={2} />
                  <Area type="monotone" dataKey="歸因營收" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.2)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 廣告成效表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">廣告活動成效與預算建議</CardTitle>
          <CardDescription>依花費排序，ROAS ≥ 3 建議加碼、&lt; 1 且無訂單建議縮減</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(data?.campaigns?.length ?? 0) > 0 ? (
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">活動</TableHead>
                  <TableHead className="text-right whitespace-nowrap">花費</TableHead>
                  <TableHead className="text-right whitespace-nowrap">曝光</TableHead>
                  <TableHead className="text-right whitespace-nowrap">點擊</TableHead>
                  <TableHead className="text-right whitespace-nowrap">CTR</TableHead>
                  <TableHead className="text-right whitespace-nowrap">訂單</TableHead>
                  <TableHead className="text-right whitespace-nowrap">營收</TableHead>
                  <TableHead className="text-right whitespace-nowrap">ROAS</TableHead>
                  <TableHead className="text-right whitespace-nowrap">CPA</TableHead>
                  <TableHead className="whitespace-nowrap">建議</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.campaigns.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell className="font-medium">{c.campaign_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{ntd(c.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{c.orders}</TableCell>
                    <TableCell className="text-right tabular-nums">{ntd(c.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.roas.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.orders > 0 ? ntd(c.cpa) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={ADVICE_MAP[c.advice].variant}>{ADVICE_MAP[c.advice].label}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">尚無資料</p>
          )}
        </CardContent>
      </Card>

      {/* LINE 成長 + 來源 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">LINE@ 成長與對話趨勢</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.lineDaily?.length ?? 0) > 0 ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data!.lineDaily}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Legend />
                    <Bar dataKey="新好友" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="封鎖" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="對話" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">尚無資料</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">加好友來源</CardTitle>
            <CardDescription>依加好友連結參數分類</CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.lineSources?.length ?? 0) > 0 ? (
              <div className="space-y-3">
                {data!.lineSources.slice(0, 8).map((s) => (
                  <div key={s.source} className="flex justify-between items-center">
                    <span className="text-sm truncate max-w-[180px]" title={s.source}>{s.source}</span>
                    <span className="text-sm font-medium tabular-nums">{s.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">尚無資料</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 訂單成立時間 × 庫存 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">提前預訂天數</CardTitle>
            <CardDescription>決定廣告要提前多久投放</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.leadTimeBuckets ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="訂單數" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">下單時段分佈</CardTitle>
            <CardDescription>決定廣告排程時段（台北時間）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.hourBuckets ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="訂單數" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">庫存關係</CardTitle>
          <CardDescription>入住日需求密度，高需求日已快滿房可降低預算、低需求日加碼促銷</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(data?.inventoryPressure ?? []).map((p) => (
              <div key={p.bucket} className="flex justify-between items-center">
                <span className="text-sm">{p.bucket}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {p.訂單數} 筆 · 平均剩餘 {p.平均剩餘房數} 間
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketingAnalyticsTab;
