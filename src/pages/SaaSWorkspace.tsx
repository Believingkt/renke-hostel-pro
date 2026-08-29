import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
  Sparkles,
  LayoutDashboard,
  Users,
  Share2,
  Gift,
  TrendingUp,
  Wallet,
  Ticket,
  UserPlus,
  UserCircle,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";


/** 頁面內全部為前端常數，不連接任何資料表或 API */

type MockKol = {
  name: string;
  igHandle: string;
  cidCode: string;
  venue: string;
  rarity: string;
  bookingStatus: string;
};

const MOCK_KOLS: MockKol[] = [
  { name: "仙女他媽（施怡君）", igHandle: "fafa09.30", cidCode: "093330", venue: "森山寫照", rarity: "UR", bookingStatus: "訂房確認中" },
  { name: "餓犬Dicky", igHandle: "dickydoggy22", cidCode: "DICKYLEMON22", venue: "旅行日-光", rarity: "SSR", bookingStatus: "訂房確認中" },
  { name: "Bryan Aka黑熊他爸🐾", igHandle: "bryanpan1014", cidCode: "BRYAN1014", venue: "雲岫海景渡假會館", rarity: "R", bookingStatus: "已取消" },
  { name: "Mika｜今晚住這裡·旅宿探索中", igHandle: "mika.checkin", cidCode: "MIKALLXX", venue: "雲岫海景渡假會館", rarity: "N", bookingStatus: "訂房確認中" },
  { name: "竹軒｜Mixx質感電商", igHandle: "xuan_keke", cidCode: "XUANKEKE", venue: "淞湘卉館", rarity: "SR", bookingStatus: "訂房確認中" },
  { name: "蘇蘇", igHandle: "mirandasue_0811", cidCode: "SUESUE", venue: "旅行日-DAIDODO", rarity: "R", bookingStatus: "訂房確認中" },
  { name: "Oreo｜建築旅遊部落客", igHandle: "little_oreo0126", cidCode: "OREO0126", venue: "奧莉薇雅生活小酒店", rarity: "R", bookingStatus: "訂房確認中" },
  { name: "明星煌", igHandle: "starmonarch", cidCode: "STARMONARCH", venue: "雲岫海景渡假會館", rarity: "SR", bookingStatus: "訂房確認中" },
];

const ADMIN_IDENTITY = "system-admin";

const VIEW_IDENTITIES = [
  ...MOCK_KOLS.map((k) => ({
    value: k.cidCode,
    label: `KOL ${k.name.replace(/（.*?）|｜.*$/g, "")}／創作者導流`,
  })),
  { value: ADMIN_IDENTITY, label: "系統管理員／總覽" },
];

type CodeOrder = { code: string; buyer: string; amount: number; status: string };
type BonusRow = { orderNo: string; checkIn: string; amount: number; bonus: number; status: string };
type KolPanel = { orders: number; bonus: number; codeOrders: CodeOrder[]; bonusRows: BonusRow[] };

/** 每位創作者一組獨立的前端假資料 */
const KOL_PANELS: Record<string, KolPanel> = {
  "093330": {
    orders: 9,
    bonus: 11240,
    codeOrders: [
      { code: "093330", buyer: "陳O瑜", amount: 12800, status: "已成交" },
      { code: "093330", buyer: "何O芳", amount: 9600, status: "待確認" },
      { code: "093330", buyer: "楊O瑄", amount: 7400, status: "已成交" },
    ],
    bonusRows: [
      { orderNo: "K7M2P9X4", checkIn: "2026-09-05", amount: 12800, bonus: 1280, status: "已入帳" },
      { orderNo: "R4T8N3B6", checkIn: "2026-09-14", amount: 9600, bonus: 960, status: "計算中" },
      { orderNo: "Q9W5Z2H7", checkIn: "2026-09-22", amount: 7400, bonus: 740, status: "已入帳" },
    ],
  },
  DICKYLEMON22: {
    orders: 6,
    bonus: 7380,
    codeOrders: [
      { code: "DICKYLEMON22", buyer: "林O辰", amount: 8600, status: "待確認" },
      { code: "DICKYLEMON22", buyer: "邱O傑", amount: 11200, status: "已成交" },
    ],
    bonusRows: [
      { orderNo: "L3F6D8K2", checkIn: "2026-09-08", amount: 8600, bonus: 860, status: "計算中" },
      { orderNo: "T5B9C2M7", checkIn: "2026-09-19", amount: 11200, bonus: 1120, status: "已入帳" },
    ],
  },
  BRYAN1014: {
    orders: 3,
    bonus: 2960,
    codeOrders: [
      { code: "BRYAN1014", buyer: "沈O瑋", amount: 6800, status: "已取消" },
      { code: "BRYAN1014", buyer: "吳O瑄", amount: 9200, status: "已成交" },
    ],
    bonusRows: [
      { orderNo: "H8N4V6R3", checkIn: "2026-09-11", amount: 9200, bonus: 920, status: "已入帳" },
    ],
  },
  MIKALLXX: {
    orders: 4,
    bonus: 4120,
    codeOrders: [
      { code: "MIKALLXX", buyer: "郭O安", amount: 7300, status: "已成交" },
      { code: "MIKALLXX", buyer: "許O筑", amount: 5400, status: "待確認" },
    ],
    bonusRows: [
      { orderNo: "D2Q7X5L9", checkIn: "2026-09-03", amount: 7300, bonus: 730, status: "已入帳" },
      { orderNo: "W6K3T8P4", checkIn: "2026-09-25", amount: 5400, bonus: 540, status: "計算中" },
    ],
  },
  XUANKEKE: {
    orders: 11,
    bonus: 14680,
    codeOrders: [
      { code: "XUANKEKE", buyer: "王O婷", amount: 15400, status: "已成交" },
      { code: "XUANKEKE", buyer: "蔡O妤", amount: 12100, status: "已成交" },
      { code: "XUANKEKE", buyer: "周O廷", amount: 8800, status: "待確認" },
    ],
    bonusRows: [
      { orderNo: "M9J4R7S2", checkIn: "2026-09-06", amount: 15400, bonus: 1540, status: "已入帳" },
      { orderNo: "P3L8V5N6", checkIn: "2026-09-17", amount: 12100, bonus: 1210, status: "已入帳" },
      { orderNo: "F7C2H9B4", checkIn: "2026-10-01", amount: 8800, bonus: 880, status: "計算中" },
    ],
  },
  SUESUE: {
    orders: 5,
    bonus: 5240,
    codeOrders: [
      { code: "SUESUE", buyer: "江O倫", amount: 6900, status: "已成交" },
      { code: "SUESUE", buyer: "簡O慈", amount: 7600, status: "待確認" },
    ],
    bonusRows: [
      { orderNo: "S4G8K3D7", checkIn: "2026-09-09", amount: 6900, bonus: 690, status: "已入帳" },
      { orderNo: "N6Y2M5Q8", checkIn: "2026-09-28", amount: 7600, bonus: 760, status: "計算中" },
    ],
  },
  OREO0126: {
    orders: 7,
    bonus: 8460,
    codeOrders: [
      { code: "OREO0126", buyer: "張O豪", amount: 6200, status: "已取消" },
      { code: "OREO0126", buyer: "鍾O儀", amount: 10400, status: "已成交" },
      { code: "OREO0126", buyer: "劉O程", amount: 9100, status: "已成交" },
    ],
    bonusRows: [
      { orderNo: "B5T9W4J2", checkIn: "2026-09-12", amount: 10400, bonus: 1040, status: "已入帳" },
      { orderNo: "V8R3P6C5", checkIn: "2026-09-24", amount: 9100, bonus: 910, status: "計算中" },
    ],
  },
  STARMONARCH: {
    orders: 8,
    bonus: 9720,
    codeOrders: [
      { code: "STARMONARCH", buyer: "李O安", amount: 21000, status: "已成交" },
      { code: "STARMONARCH", buyer: "范O琳", amount: 8300, status: "待確認" },
    ],
    bonusRows: [
      { orderNo: "X2D7L4F9", checkIn: "2026-09-07", amount: 21000, bonus: 2100, status: "已入帳" },
      { orderNo: "C6M1K8T3", checkIn: "2026-09-21", amount: 8300, bonus: 830, status: "計算中" },
    ],
  },
};

const ADMIN_PANEL: KolPanel = {
  orders: Object.values(KOL_PANELS).reduce((s, p) => s + p.orders, 0),
  bonus: Object.values(KOL_PANELS).reduce((s, p) => s + p.bonus, 0),
  codeOrders: Object.values(KOL_PANELS).flatMap((p) => p.codeOrders).slice(0, 8),
  bonusRows: Object.values(KOL_PANELS).flatMap((p) => p.bonusRows).slice(0, 8),
};


const MOCK_STATS = [
  { title: "本月總轉換數", value: "184", icon: TrendingUp, variant: "coral" as const },
  { title: "總分潤金額", value: "NT$ 246,300", icon: Wallet, variant: "cyan" as const },
  { title: "活躍 KOL 數", value: "38", icon: Users, variant: "blue" as const },
  { title: "平均客單價", value: "NT$ 13,420", icon: LayoutDashboard, variant: "purple" as const },
];

const STAT_VARIANTS = {
  coral: "bg-stat-coral-light text-stat-coral",
  cyan: "bg-stat-cyan-light text-stat-cyan",
  blue: "bg-stat-blue-light text-stat-blue",
  purple: "bg-stat-purple-light text-stat-purple",
};

const MOCK_TREND = [
  { day: "08/23", conversions: 18 },
  { day: "08/24", conversions: 24 },
  { day: "08/25", conversions: 21 },
  { day: "08/26", conversions: 32 },
  { day: "08/27", conversions: 28 },
  { day: "08/28", conversions: 35 },
  { day: "08/29", conversions: 41 },
];

const MOCK_INVITES = [
  { inviter: "仙女他媽（施怡君）", invitee: "蘇蘇", date: "2026-08-12", status: "已加入" },
  { inviter: "餓犬Dicky", invitee: "明星煌", date: "2026-08-16", status: "已邀約" },
  { inviter: "竹軒｜Mixx質感電商", invitee: "Mika｜今晚住這裡·旅宿探索中", date: "2026-08-20", status: "待確認" },
  { inviter: "Oreo｜建築旅遊部落客", invitee: "Bryan Aka黑熊他爸🐾", date: "2026-08-24", status: "已加入" },
];

const MOCK_INVITE_CODES = [
  { code: "LZ-A7K2", owner: "旅行日-光 社群管理員", used: 3, createdAt: "2026-07-28", status: "啟用中" },
  { code: "LZ-B3M9", owner: "森山寫照 社群管理員", used: 2, createdAt: "2026-08-04", status: "啟用中" },
  { code: "LZ-C8Q4", owner: "雲岫海景渡假會館 社群管理員", used: 1, createdAt: "2026-08-11", status: "已停用" },
  { code: "LZ-D5T1", owner: "淞湘卉館 社群管理員", used: 2, createdAt: "2026-08-18", status: "啟用中" },
];

const MOCK_SPREAD_TREE = [
  { level: 1, label: "第一層擴散", people: 5, note: "由社群管理員直接邀請" },
  { level: 2, label: "第二層擴散", people: 3, note: "由第一層成員再邀請" },
];

const MOCK_REWARD_TIERS = [
  { tier: "第一層", rate: "8%", condition: "被邀請人完成首筆入住" },
  { tier: "第二層", rate: "3%", condition: "第二層成員完成首筆入住" },
  { tier: "管理員加碼", rate: "+2%", condition: "單月累積轉換 ≥ 5 筆" },
];


const CID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function buildCidCode(name: string) {
  const prefix = (name.replace(/[^A-Za-z]/g, "").toUpperCase() || "LZKOL").slice(0, 5);
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += CID_CHARS[Math.floor(Math.random() * CID_CHARS.length)];
  }
  return `${prefix}${suffix}`;
}

function statusVariantClass(status: string) {
  if (status === "已成交" || status === "已加入" || status === "已入帳" || status === "啟用中") {
    return "border-primary/40 text-primary";
  }
  if (status === "已取消" || status === "已停用") {
    return "border-destructive/40 text-destructive";
  }
  return "border-muted-foreground/30 text-muted-foreground";
}

export default function SaaSWorkspace() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [accountName, setAccountName] = useState("");

  const [identity, setIdentity] = useState(VIEW_IDENTITIES[0].value);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        navigate("/auth?next=" + encodeURIComponent("/SaaS"), { replace: true });
        return;
      }
      const u = data.session.user;
      const meta = (u.user_metadata ?? {}) as Record<string, string>;
      setAccountName(meta.display_name || meta.name || meta.full_name || u.email || "已登入帳號");
      setSignedIn(true);
      setAuthChecked(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setSignedIn(false);
        navigate("/auth?next=" + encodeURIComponent("/SaaS"), { replace: true });
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const identityLabel = useMemo(
    () => VIEW_IDENTITIES.find((i) => i.value === identity)?.label ?? "",
    [identity],
  );

  const isAdminView = identity === ADMIN_IDENTITY;

  const selectedKol = isAdminView ? MOCK_KOLS[0].cidCode : identity;

  const selectedKolName = useMemo(
    () => MOCK_KOLS.find((k) => k.cidCode === selectedKol)?.name ?? "",
    [selectedKol],
  );

  const panel = isAdminView ? ADMIN_PANEL : KOL_PANELS[identity] ?? ADMIN_PANEL;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth?next=" + encodeURIComponent("/SaaS"), { replace: true });
  };

  if (!authChecked || !signedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="admin-theme min-h-screen bg-background overflow-x-hidden">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8 space-y-6">
        <header className="flex flex-col gap-3 border-b border-primary/20 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
              <Sparkles className="h-6 w-6 text-primary" />
              成長營運工作台
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              多渠道創作者內容導流與社群裂變推廣的整合視圖
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">檢視身份</Label>
              <Select value={identity} onValueChange={setIdentity}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIEW_IDENTITIES.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">目前檢視：{identityLabel}</span>
            </div>

            <div className="sm:pl-3 sm:border-l">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-10 gap-2 px-3">
                    <UserCircle className="h-5 w-5 shrink-0" />
                    <span className="max-w-[160px] truncate text-sm font-medium">{accountName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    className="cursor-pointer py-3"
                    onClick={() => toast.info("功能開發中")}
                  >
                    <UserCircle className="mr-2 h-4 w-4" />
                    個人基本資料
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer py-3 text-destructive"
                    onClick={handleSignOut}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    登出
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <Tabs defaultValue="d1" className="w-full">
          <TabsList>
            <TabsTrigger value="d1">創作者導流</TabsTrigger>
            <TabsTrigger value="d2">社群裂變</TabsTrigger>
          </TabsList>


          {/* D1 */}
          <TabsContent value="d1" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Ticket className="h-5 w-5 text-primary" />
                  KOL 影片折扣碼自主生成
                </CardTitle>
                <CardDescription>選擇創作者後產生專屬折扣碼，供影片與貼文導流使用</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">KOL 姓名</Label>
                    <Select
                      value={selectedKol}
                      onValueChange={(v) => {
                        setIdentity(v);
                        setGeneratedCode(null);
                      }}
                    >

                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MOCK_KOLS.map((k) => (
                          <SelectItem key={k.cidCode} value={k.cidCode}>
                            {k.name}（{k.igHandle}）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => setGeneratedCode(buildCidCode(selectedKolName))}>
                    產生折扣碼
                  </Button>
                </div>

                {generatedCode && (
                  <div className="rounded-lg border border-primary/30 bg-secondary/60 p-4">
                    <p className="text-xs text-muted-foreground">{selectedKolName} 的專屬折扣碼</p>
                    <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-primary">
                      {generatedCode}
                    </p>
                  </div>
                )}

                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>折扣碼</TableHead>
                        <TableHead>訂購人</TableHead>
                        <TableHead className="text-right">金額</TableHead>
                        <TableHead>狀態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {panel.codeOrders.map((o) => (
                        <TableRow key={o.code + o.buyer}>
                          <TableCell className="font-mono whitespace-nowrap">{o.code}</TableCell>
                          <TableCell className="whitespace-nowrap">{o.buyer}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            NT$ {o.amount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusVariantClass(o.status)}>
                              {o.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-5 w-5 text-primary" />
                  KOL 分潤儀表板
                </CardTitle>
                <CardDescription>創作者本人視角的成效與獎金明細</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">本月訂單數</p>
                    <p className="mt-1 text-2xl font-bold">{panel.orders}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">預估獎金</p>
                    <p className="mt-1 text-2xl font-bold text-primary">
                      NT$ {panel.bonus.toLocaleString()}
                    </p>

                  </Card>
                </div>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>訂單編號</TableHead>
                        <TableHead>入住日期</TableHead>
                        <TableHead className="text-right">訂單金額</TableHead>
                        <TableHead className="text-right">分潤金額</TableHead>
                        <TableHead>狀態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {panel.bonusRows.map((r) => (
                        <TableRow key={r.orderNo}>
                          <TableCell className="font-mono whitespace-nowrap">{r.orderNo}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.checkIn}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            NT$ {r.amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-primary">
                            NT$ {r.bonus.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusVariantClass(r.status)}>
                              {r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LayoutDashboard className="h-5 w-5 text-primary" />
                  主系統總儀表板
                </CardTitle>
                <CardDescription>全站創作者導流成效總覽</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {MOCK_STATS.map((s) => (
                    <Card key={s.title} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-muted-foreground">{s.title}</p>
                          <p className="mt-1 text-xl font-bold md:text-2xl">{s.value}</p>
                        </div>
                        <div className={cn("rounded-xl p-3", STAT_VARIANTS[s.variant])}>
                          <s.icon className="h-6 w-6" />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                <div className="rounded-lg border p-4">
                  <p className="mb-3 text-sm font-medium">近 7 日轉換數趨勢</p>
                  <ChartContainer
                    config={{ conversions: { label: "轉換數", color: "hsl(var(--primary))" } }}
                    className="h-[240px] w-full"
                  >
                    <LineChart data={MOCK_TREND} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} />
                      <YAxis width={32} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line
                        type="monotone"
                        dataKey="conversions"
                        stroke="var(--color-conversions)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ChartContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserPlus className="h-5 w-5 text-primary" />
                  網紅邀約網紅
                </CardTitle>
                <CardDescription>創作者互相引薦的擴散紀錄</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>邀約人</TableHead>
                        <TableHead>被邀約人</TableHead>
                        <TableHead>邀約日期</TableHead>
                        <TableHead>狀態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MOCK_INVITES.map((i) => (
                        <TableRow key={i.inviter + i.invitee}>
                          <TableCell>{i.inviter}</TableCell>
                          <TableCell>{i.invitee}</TableCell>
                          <TableCell className="whitespace-nowrap">{i.date}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusVariantClass(i.status)}>
                              {i.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* D2 */}
          <TabsContent value="d2" className="mt-4 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Share2 className="h-5 w-5 text-primary" />
                  社群裂變邀請管理服務
                </CardTitle>
                <CardDescription>LINE 社群邀請碼建立與使用狀況</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>邀請碼</TableHead>
                        <TableHead>建立者</TableHead>
                        <TableHead className="text-right">使用次數</TableHead>
                        <TableHead>建立日期</TableHead>
                        <TableHead>狀態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MOCK_INVITE_CODES.map((c) => (
                        <TableRow key={c.code}>
                          <TableCell className="font-mono whitespace-nowrap">{c.code}</TableCell>
                          <TableCell>{c.owner}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.used}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.createdAt}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusVariantClass(c.status)}>
                              {c.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  自主裂變式擴散推廣與績效追蹤
                </CardTitle>
                <CardDescription>邀請鏈的層級擴散人數與轉換表現</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">總擴散人數</p>
                    <p className="mt-1 text-2xl font-bold">300</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">轉換率</p>
                    <p className="mt-1 text-2xl font-bold text-primary">12.4%</p>
                  </Card>
                </div>
                <ul className="space-y-2">
                  {MOCK_SPREAD_TREE.map((n) => (
                    <li
                      key={n.level}
                      className={cn(
                        "rounded-lg border bg-card p-3",
                        n.level === 2 && "ml-6 border-dashed",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{n.label}</span>
                        <span className="tabular-nums text-primary">{n.people} 人</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{n.note}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gift className="h-5 w-5 text-primary" />
                  多層級邀請獎勵設計服務
                </CardTitle>
                <CardDescription>各層級的獎勵比例與達標條件</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>層級</TableHead>
                        <TableHead>獎勵比例</TableHead>
                        <TableHead>達標條件</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MOCK_REWARD_TIERS.map((t) => (
                        <TableRow key={t.tier}>
                          <TableCell className="whitespace-nowrap">{t.tier}</TableCell>
                          <TableCell className="tabular-nums text-primary">{t.rate}</TableCell>
                          <TableCell>{t.condition}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
