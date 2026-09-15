import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, Gift, Link2, Loader2, Share2, TicketPercent, TrendingUp, Users } from "lucide-react";

interface CodeRow {
  id: string;
  code: string;
  name: string;
  accommodation_id: string;
  is_active: boolean;
  used_count: number;
  usage_limit: number;
  valid_until: string | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  order_date: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  accommodation_id: string | null;
  gross_revenue: number;
  commission_base: number;
  commission_rate: number;
  commission_amount: number;
  is_settleable: boolean;
}

interface ReferralRow {
  id: string;
  invite_code: string;
  status: string;
  override_rate: number;
  is_active: boolean;
  invitee_display_name: string | null;
  invitee_cid_code: string | null;
  downline_commission: number;
  override_amount: number;
  created_at: string;
}

interface Payload {
  kol: { id: string; name: string | null; cid_code: string | null; venue_name: string | null; token_expires_at: string };
  codes: CodeRow[];
  accommodation_names: Record<string, string>;
  summary: {
    order_count: number;
    gross_revenue: number;
    commission_base_total: number;
    commission_total: number;
    settled_commission: number;
    pending_commission: number;
    override_total: number;
  };
  orders: OrderRow[];
  referrals: ReferralRow[];
}

const twd = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;

export default function KolDashboardPublic() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("kol-dashboard", { body: { token } });
    if (error || (res as any)?.error) {
      setErrorCode(((res as any)?.error as string) ?? "invalid");
      setData(null);
    } else {
      setErrorCode(null);
      setData(res as Payload);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const inviteBase = `${window.location.origin}/kol/join/`;

  const createInvite = async () => {
    if (!token) return;
    setCreating(true);
    const { data: res, error } = await supabase.functions.invoke("kol-dashboard", {
      body: { token, action: "create_invite" },
    });
    setCreating(false);
    if (error || (res as any)?.error) {
      toast.error("產生邀請碼失敗，請稍後再試");
      return;
    }
    toast.success("已產生新的邀請連結");
    void load();
  };

  const copy = async (text: string, label = "連結") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已複製${label}`);
    } catch {
      toast.error("複製失敗，請長按手動複製");
    }
  };

  const shareLine = (url: string) => {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(url)}`, "_blank", "noopener");
  };

  const totalUsed = useMemo(
    () => (data?.codes ?? []).reduce((s, c) => s + Number(c.used_count ?? 0), 0),
    [data],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (errorCode || !data) {
    const msg =
      errorCode === "expired"
        ? "此連結已過期，請聯繫窗口重新產生。"
        : "連結無效，請確認網址是否正確。";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <Card className="w-full max-w-sm">
          <CardContent className="py-10 text-center text-muted-foreground">{msg}</CardContent>
        </Card>
      </div>
    );
  }

  const { kol, summary, codes, orders, referrals, accommodation_names: accNames } = data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 via-background to-background pb-16">
      <header className="px-5 pb-6 pt-8">
        <p className="text-sm text-muted-foreground">創作者分潤儀表板</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{kol.name ?? "創作者"}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {kol.cid_code && <Badge className="bg-primary text-primary-foreground">{kol.cid_code}</Badge>}
          {kol.venue_name && <Badge variant="secondary">{kol.venue_name}</Badge>}
        </div>
      </header>

      <main className="space-y-5 px-4">
        {/* 成效摘要 */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <TrendingUp className="h-4 w-4" /> 帶來訂單
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-foreground">{summary.order_count}</p>
              <p className="mt-1 text-xs text-muted-foreground">訂單金額 {twd(summary.gross_revenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Gift className="h-4 w-4" /> 累積分潤
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-primary">{twd(summary.commission_total)}</p>
              <p className="mt-1 text-xs text-muted-foreground">可結算 {twd(summary.settled_commission)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">未達結算</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums text-foreground">{twd(summary.pending_commission)}</p>
              <p className="mt-1 text-xs text-muted-foreground">退房後才可結算</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Users className="h-4 w-4" /> 下線 override
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums text-foreground">{twd(summary.override_total)}</p>
              <p className="mt-1 text-xs text-muted-foreground">已加入 {referrals.filter((r) => r.status === "joined").length} 位</p>
            </CardContent>
          </Card>
        </div>
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          口徑說明：金額一律沿用既有結算機制計算 —— 分潤基準＝訂單實收金額扣除加購項目（若後台有人工覆蓋則以覆蓋值為準），
          乘上該館別當期 KOL 抽成比例；只計台幣訂單、不含已取消訂單；「可結算」為已退房之訂單。
          下線 override＝下線分潤金額 × override 比例，比例由總部設定。
        </p>

        {/* 折扣碼 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TicketPercent className="h-4 w-4" /> 我的折扣碼（累計使用 {totalUsed} 次）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {codes.length === 0 && (
              <p className="text-sm text-muted-foreground">尚未發放折扣碼，總部審核後將為你開通。</p>
            )}
            {codes.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{c.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {accNames[c.accommodation_id] ?? "—"}・{c.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "啟用中" : "已停用"}</Badge>
                    <Button size="sm" variant="outline" onClick={() => copy(c.code, "折扣碼")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  使用 {c.used_count}/{c.usage_limit} 次・有效至 {c.valid_until?.slice(0, 10) ?? "不限"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 邀請 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" /> 我的邀請
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={createInvite} disabled={creating} className="w-full">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              產生新的邀請連結
            </Button>
            {referrals.length === 0 && (
              <p className="text-sm text-muted-foreground">還沒有邀請紀錄，邀請夥伴加入即可獲得 override 獎勵。</p>
            )}
            {referrals.map((r) => {
              const url = `${inviteBase}${r.invite_code}`;
              return (
                <div key={r.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-sm font-semibold text-foreground">{r.invite_code}</p>
                    <Badge variant={r.status === "joined" ? "default" : "secondary"}>
                      {r.status === "joined" ? "已加入" : "待加入"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.invitee_display_name ? `受邀：${r.invitee_display_name}` : "尚未有人填寫"}
                    ・override {Number(r.override_rate)}%
                  </p>
                  {r.status === "joined" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      下線分潤 {twd(r.downline_commission)}，我的 override {twd(r.override_amount)}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => copy(url)}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> 複製連結
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => shareLine(url)}>
                      <Share2 className="mr-1 h-3.5 w-3.5" /> 分享到 LINE
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* 訂單明細 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">訂單明細</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">訂單</TableHead>
                    <TableHead className="whitespace-nowrap">館別</TableHead>
                    <TableHead className="whitespace-nowrap">退房日</TableHead>
                    <TableHead className="whitespace-nowrap text-right">分潤基準</TableHead>
                    <TableHead className="whitespace-nowrap text-right">比例</TableHead>
                    <TableHead className="whitespace-nowrap text-right">分潤</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        尚無訂單
                      </TableCell>
                    </TableRow>
                  )}
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{o.order_number}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {o.accommodation_id ? (accNames[o.accommodation_id] ?? "—") : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{o.check_out_date?.slice(0, 10) ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{twd(o.commission_base)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{o.commission_rate}%</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums font-medium">
                        {twd(o.commission_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Separator />
        <p className="pb-6 text-center text-xs text-muted-foreground">
          連結有效至 {data.kol.token_expires_at?.slice(0, 10)}・數值每次開啟即時計算
        </p>
      </main>
    </div>
  );
}
