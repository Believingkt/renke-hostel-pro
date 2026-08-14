import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, Link2, Loader2, RefreshCw, Users } from "lucide-react";

interface KolRow {
  id: string;
  name: string | null;
  cid_code: string | null;
  venue_name: string | null;
  accommodation_id: string | null;
  public_token: string | null;
  token_expires_at: string | null;
  cid_configured: boolean;
}

interface ApiOrder {
  id: string;
  discount_code: string | null;
  order_date: string | null;
  check_out_date: string | null;
  accommodation_id: string | null;
  gross_revenue: number;
  commission_base: number;
}

interface CommissionSetting {
  accommodation_id: string;
  effective_from: string;
  rate: number | null;
}

interface ReferralRow {
  id: string;
  inviter_kol_id: string;
  invitee_kol_id: string | null;
  invite_code: string;
  status: string;
  override_rate: number;
  is_active: boolean;
  invitee_name: string | null;
  invitee_ig: string | null;
  invitee_contact: string | null;
  joined_at: string | null;
  created_at: string;
}

const twd = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;
const TOKEN_DAYS = 180;

const randomToken = () =>
  (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 40);

export default function AdminKolOverview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [kols, setKols] = useState<KolRow[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [commissions, setCommissions] = useState<CommissionSetting[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [codeIdByCode, setCodeIdByCode] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [kolRes, apiRes, refRes, codeRes] = await Promise.all([
      supabase
        .from("kol_profiles")
        .select("id, name, cid_code, venue_name, accommodation_id, public_token, token_expires_at, cid_configured")
        .eq("cid_configured", true)
        .not("cid_code", "is", null)
        .neq("cid_code", ""),
      supabase.functions.invoke("kol-bonus-public", { body: { mode: "internal" } }),
      supabase
        .from("kol_referrals")
        .select(
          "id, inviter_kol_id, invitee_kol_id, invite_code, status, override_rate, is_active, invitee_name, invitee_ig, invitee_contact, joined_at, created_at",
        )
        .order("created_at", { ascending: false }),
      supabase.from("discount_codes").select("id, code, is_active").eq("is_active", true),
    ]);

    const activeCodeSet = new Set(
      (codeRes.data ?? []).map((c) => (c.code ?? "").trim().toUpperCase()).filter(Boolean),
    );
    setKols(
      ((kolRes.data ?? []) as KolRow[]).filter((k) =>
        activeCodeSet.has((k.cid_code ?? "").trim().toUpperCase()),
      ),
    );
    setReferrals((refRes.data ?? []) as ReferralRow[]);
    const payload = (apiRes.data ?? {}) as any;
    setOrders((payload.orders ?? []) as ApiOrder[]);
    setCommissions((payload.commissions ?? []) as CommissionSetting[]);
    const map: Record<string, string> = {};
    for (const c of codeRes.data ?? []) map[(c.code ?? "").toUpperCase()] = c.id;
    setCodeIdByCode(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const getRate = useCallback(
    (accId: string | null, refDate?: string | null) => {
      if (!accId) return 0;
      const list = commissions.filter((c) => c.accommodation_id === accId);
      if (list.length === 0) return 0;
      if (!refDate) return Number(list[0]?.rate ?? 0);
      const ref = refDate.slice(0, 10);
      const hit = list.find((s) => s.effective_from <= ref);
      return Number(hit?.rate ?? 0);
    },
    [commissions],
  );

  const monthPrefix = new Date().toISOString().slice(0, 7);

  /** 每個 KOL 折扣碼的彙總（口徑沿用 kol-bonus-public 的分潤基準金額） */
  const perCode = useMemo(() => {
    const map = new Map<
      string,
      { orders: number; revenue: number; commission: number; monthOrders: number; monthRevenue: number; monthCommission: number }
    >();
    for (const o of orders) {
      const code = (o.discount_code ?? "").trim().toUpperCase();
      if (!code) continue;
      const cur =
        map.get(code) ??
        { orders: 0, revenue: 0, commission: 0, monthOrders: 0, monthRevenue: 0, monthCommission: 0 };
      const rate = getRate(o.accommodation_id, o.check_out_date);
      const commission = Math.round(Number(o.commission_base ?? 0) * (rate / 100));
      cur.orders += 1;
      cur.revenue += Number(o.gross_revenue ?? 0);
      cur.commission += commission;
      if (o.order_date?.startsWith(monthPrefix)) {
        cur.monthOrders += 1;
        cur.monthRevenue += Number(o.gross_revenue ?? 0);
      }
      if (o.check_out_date?.startsWith(monthPrefix)) cur.monthCommission += commission;
      map.set(code, cur);
    }
    return map;
  }, [orders, getRate, monthPrefix]);

  const ranking = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kols
      .map((k) => {
        const stat = perCode.get((k.cid_code ?? "").toUpperCase());
        return {
          ...k,
          orders: stat?.orders ?? 0,
          revenue: stat?.revenue ?? 0,
          commission: stat?.commission ?? 0,
        };
      })
      .filter((k) =>
        !q ? true : `${k.name ?? ""} ${k.cid_code ?? ""} ${k.venue_name ?? ""}`.toLowerCase().includes(q),
      )
      .sort((a, b) => b.revenue - a.revenue);
  }, [kols, perCode, search]);

  const stats = useMemo(() => {
    let monthOrders = 0;
    let monthRevenue = 0;
    let monthCommission = 0;
    for (const [, v] of perCode) {
      monthOrders += v.monthOrders;
      monthRevenue += v.monthRevenue;
      monthCommission += v.monthCommission;
    }
    return {
      kolCount: kols.length,
      monthOrders,
      monthRevenue,
      monthCommission,
      joined: referrals.filter((r) => r.status === "joined").length,
      pending: referrals.filter((r) => r.status !== "joined").length,
    };
  }, [perCode, kols, referrals]);

  const kolNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of kols) m.set(k.id, k.name ?? "—");
    return m;
  }, [kols]);

  const tokenValid = (k: KolRow) =>
    !!k.public_token && !!k.token_expires_at && new Date(k.token_expires_at).getTime() > Date.now();

  const issueToken = async (k: KolRow) => {
    setSavingId(k.id);
    const token = randomToken();
    const expires = new Date(Date.now() + TOKEN_DAYS * 86400000).toISOString();
    const { error } = await supabase
      .from("kol_profiles")
      .update({ public_token: token, token_expires_at: expires })
      .eq("id", k.id);
    setSavingId(null);
    if (error) {
      toast.error("產生失敗：" + error.message);
      return;
    }
    setKols((prev) => prev.map((x) => (x.id === k.id ? { ...x, public_token: token, token_expires_at: expires } : x)));
    toast.success("已產生儀表板連結");
  };

  const revokeToken = async (k: KolRow) => {
    setSavingId(k.id);
    const { error } = await supabase
      .from("kol_profiles")
      .update({ public_token: null, token_expires_at: null })
      .eq("id", k.id);
    setSavingId(null);
    if (error) {
      toast.error("停用失敗：" + error.message);
      return;
    }
    setKols((prev) => prev.map((x) => (x.id === k.id ? { ...x, public_token: null, token_expires_at: null } : x)));
    toast.success("已停用連結");
  };

  const copyDashboard = async (k: KolRow) => {
    if (!k.public_token) return;
    const url = `${window.location.origin}/kol/d/${k.public_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("已複製儀表板連結");
    } catch {
      toast.error("複製失敗");
    }
  };

  const saveOverride = async (r: ReferralRow) => {
    const raw = overrideDraft[r.id];
    const value = Number(raw);
    if (raw === undefined || Number.isNaN(value) || value < 0 || value > 100) {
      toast.error("請輸入 0–100 的比例");
      return;
    }
    setSavingId(r.id);
    const { error } = await supabase.from("kol_referrals").update({ override_rate: value }).eq("id", r.id);
    setSavingId(null);
    if (error) {
      toast.error("更新失敗：" + error.message);
      return;
    }
    setReferrals((prev) => prev.map((x) => (x.id === r.id ? { ...x, override_rate: value } : x)));
    setOverrideDraft((d) => {
      const next = { ...d };
      delete next[r.id];
      return next;
    });
    toast.success("已更新 override 比例");
  };

  const toggleReferral = async (r: ReferralRow) => {
    setSavingId(r.id);
    const { error } = await supabase.from("kol_referrals").update({ is_active: !r.is_active }).eq("id", r.id);
    setSavingId(null);
    if (error) {
      toast.error("更新失敗：" + error.message);
      return;
    }
    setReferrals((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: !r.is_active } : x)));
  };

  const openDetail = (code: string | null) => {
    const id = codeIdByCode[(code ?? "").toUpperCase()];
    if (!id) {
      toast.error("此 KOL 尚未建立對應折扣碼");
      return;
    }
    navigate(`/admin/discount-codes/${id}/detail`);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">創作者導流總覽</h1>
          <p className="text-sm text-muted-foreground">
            KOL 導流、分潤與邀約關係的統一檢視；金額口徑沿用既有折扣碼分潤計算（分潤基準＝實收金額扣加購，乘當期館別抽成）。
          </p>
        </div>
        <Button variant="outline" onClick={fetchAll}>
          <RefreshCw className="mr-2 h-4 w-4" /> 重新整理
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: "KOL 總數（已配碼）", value: String(stats.kolCount), hint: "kol_profiles 有折扣碼者" },
          { label: "本月導流訂單", value: `${stats.monthOrders} 筆`, hint: `金額 ${twd(stats.monthRevenue)}（依訂單日）` },
          { label: "本月應付分潤", value: twd(stats.monthCommission), hint: "依退房月份歸屬" },
          { label: "邀約轉換", value: `${stats.joined} / ${stats.joined + stats.pending}`, hint: "已加入 / 總邀請" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-foreground">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="ranking">
        <TabsList>
          <TabsTrigger value="ranking">KOL 排行</TabsTrigger>
          <TabsTrigger value="referrals">邀約關係</TabsTrigger>
          <TabsTrigger value="tokens">儀表板連結</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking" className="mt-4 space-y-3">
          <Input
            placeholder="搜尋 KOL 名稱／折扣碼／館別"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Card>
            <CardContent className="p-0">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">KOL</TableHead>
                    <TableHead className="w-[120px]">折扣碼</TableHead>
                    <TableHead className="w-[160px]">館別</TableHead>
                    <TableHead className="w-[100px] text-right">訂單數</TableHead>
                    <TableHead className="w-[140px] text-right">導流金額</TableHead>
                    <TableHead className="w-[140px] text-right">分潤</TableHead>
                    <TableHead className="w-[110px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        無資料
                      </TableCell>
                    </TableRow>
                  )}
                  {ranking.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="truncate">{k.name ?? "—"}</TableCell>
                      <TableCell className="truncate font-mono text-xs">{k.cid_code}</TableCell>
                      <TableCell className="truncate">{k.venue_name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{k.orders}</TableCell>
                      <TableCell className="text-right tabular-nums">{twd(k.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{twd(k.commission)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(k.cid_code)}>
                          明細
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrals" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" /> 網紅邀約網紅
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">邀請方</TableHead>
                    <TableHead className="w-[120px]">邀請碼</TableHead>
                    <TableHead className="w-[200px]">受邀方</TableHead>
                    <TableHead className="w-[100px]">狀態</TableHead>
                    <TableHead className="w-[170px]">override（%）</TableHead>
                    <TableHead className="w-[110px] text-right">啟用</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        尚無邀約紀錄
                      </TableCell>
                    </TableRow>
                  )}
                  {referrals.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="truncate">{kolNameById.get(r.inviter_kol_id) ?? "—"}</TableCell>
                      <TableCell className="truncate font-mono text-xs">{r.invite_code}</TableCell>
                      <TableCell className="truncate">
                        {r.invitee_kol_id
                          ? kolNameById.get(r.invitee_kol_id) ?? r.invitee_name ?? "（待審核草稿）"
                          : r.invitee_name ?? "—"}
                        {r.invitee_ig && <span className="ml-1 text-xs text-muted-foreground">{r.invitee_ig}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "joined" ? "default" : "secondary"}>
                          {r.status === "joined" ? "已加入" : "待加入"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-8 w-20"
                            type="number"
                            min={0}
                            max={100}
                            value={overrideDraft[r.id] ?? String(r.override_rate)}
                            onChange={(e) => setOverrideDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingId === r.id || overrideDraft[r.id] === undefined}
                            onClick={() => saveOverride(r)}
                          >
                            儲存
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" disabled={savingId === r.id} onClick={() => toggleReferral(r)}>
                          {r.is_active ? "停用" : "啟用"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tokens" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" /> KOL 自助儀表板連結（有效 {TOKEN_DAYS} 天）
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">KOL</TableHead>
                    <TableHead className="w-[120px]">折扣碼</TableHead>
                    <TableHead className="w-[130px]">狀態</TableHead>
                    <TableHead className="w-[130px]">到期日</TableHead>
                    <TableHead className="w-[260px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="truncate">{k.name ?? "—"}</TableCell>
                      <TableCell className="truncate font-mono text-xs">{k.cid_code}</TableCell>
                      <TableCell>
                        {!k.public_token ? (
                          <Badge variant="secondary">未產生</Badge>
                        ) : tokenValid(k) ? (
                          <Badge>有效</Badge>
                        ) : (
                          <Badge variant="outline">已過期</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {k.token_expires_at?.slice(0, 10) ?? "—"}
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button size="sm" variant="outline" disabled={savingId === k.id} onClick={() => issueToken(k)}>
                          {k.public_token ? "重發" : "產生"}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={!k.public_token} onClick={() => copyDashboard(k)}>
                          <Copy className="mr-1 h-3.5 w-3.5" /> 複製
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!k.public_token || savingId === k.id}
                          onClick={() => revokeToken(k)}
                        >
                          停用
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
