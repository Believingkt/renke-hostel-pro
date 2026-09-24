import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lakeze/shared/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@lakeze/shared/components/ui/accordion";
import { Button } from "@lakeze/shared/components/ui/button";
import { Label } from "@lakeze/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@lakeze/shared/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lakeze/shared/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lakeze/shared/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@lakeze/shared/components/ui/radio-group";
import { Input } from "@lakeze/shared/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@lakeze/shared/components/ui/chart";
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
  ExternalLink,
} from "lucide-react";
import { cn } from "@lakeze/shared/lib/utils";

const LABOR_FORM_URL =
  "https://ap15.ragic.com/lakeze/ragicadministration/5?ragic-web-embed=true&webaction=form&ver=new&version=2";




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

type CommunityManager = {
  id: string;
  label: string;
  venue: string;
  inviteCode: string;
};

/** 社群管理員（對應歷史邀請碼建立者） */
const COMMUNITY_MANAGERS: CommunityManager[] = [
  { id: "cm-lvxingri-guang", label: "旅行日-光 社群管理員", venue: "旅行日-光", inviteCode: "LZ-A7K2" },
  { id: "cm-senshan", label: "森山寫照 社群管理員", venue: "森山寫照", inviteCode: "LZ-B3M9" },
  { id: "cm-yunxiu", label: "雲岫海景渡假會館 社群管理員", venue: "雲岫海景渡假會館", inviteCode: "LZ-C8Q4" },
  { id: "cm-songxiang", label: "淞湘卉館 社群管理員", venue: "淞湘卉館", inviteCode: "LZ-D5T1" },
];

const KOL_IDENTITIES = MOCK_KOLS.map((k) => ({
  value: k.cidCode,
  label: `KOL ${k.name.replace(/（.*?）|｜.*$/g, "")}／創作者導流`,
}));

const MANAGER_IDENTITIES = COMMUNITY_MANAGERS.map((m) => ({
  value: m.id,
  label: m.label,
}));

const VIEW_IDENTITIES = [
  ...KOL_IDENTITIES,
  ...MANAGER_IDENTITIES,
  { value: ADMIN_IDENTITY, label: "系統管理員／總覽" },
];


type CodeOrder = { code: string; buyer: string; amount: number; status: string };
type BonusRow = { orderNo: string; checkIn: string; amount: number; bonus: number; status: string };
type KolPanel = { orders: number; bonus: number; codeOrders: CodeOrder[]; bonusRows: BonusRow[] };

/** 每位創作者一組獨立的前端假資料 */
const KOL_PANELS: Record<string, KolPanel> = {
  "093330": {
    orders: 3,
    bonus: 2980,
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
    orders: 2,
    bonus: 1980,
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
    orders: 0,
    bonus: 0,
    codeOrders: [
      { code: "BRYAN1014", buyer: "沈O瑋", amount: 6800, status: "已取消" },
      { code: "BRYAN1014", buyer: "吳O瑄", amount: 9200, status: "已取消" },
    ],
    bonusRows: [
      { orderNo: "H8N4V6R3", checkIn: "2026-09-11", amount: 9200, bonus: 0, status: "已取消（不計入獎金）" },
    ],
  },
  MIKALLXX: {
    orders: 2,
    bonus: 1270,
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
    orders: 3,
    bonus: 3630,
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
    orders: 2,
    bonus: 1450,
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
    orders: 2,
    bonus: 1950,
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
    orders: 2,
    bonus: 2930,
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

const MOCK_REWARD_TIERS = [
  { tier: "第一層", rate: "8%", condition: "被邀請人完成首筆入住" },
  { tier: "第二層", rate: "3%", condition: "第二層成員完成首筆入住" },
  { tier: "管理員加碼", rate: "+2%", condition: "單月累積轉換 ≥ 5 筆" },
];

type SpreadPartner = { name: string; level: "第一層" | "第二層"; orders: number; bonus: number };
type Level1Member = { name: string; joinedAt: string };
type Level2Member = { name: string; invitedBy: string; joinedAt: string };
type ManagerPanel = {
  venue: string;
  totalSpread: number;
  level1: number;
  level2: number;
  conversions: number;
  monthlyBonus: number;
  partners: SpreadPartner[];
  level1Members: Level1Member[];
  level2Members: Level2Member[];
};

/** 各社群管理員的館別視角假資料（加總與全站小樣本一致） */
const MANAGER_PANELS: Record<string, ManagerPanel> = {
  "cm-lvxingri-guang": {
    venue: "旅行日-光",
    totalSpread: 3,
    level1: 2,
    level2: 1,
    conversions: 1,
    monthlyBonus: 1840,
    partners: [
      { name: "陳O安", level: "第一層", orders: 1, bonus: 1040 },
      { name: "林O妤", level: "第一層", orders: 0, bonus: 0 },
      { name: "黃O豪", level: "第二層", orders: 0, bonus: 0 },
    ],
    level1Members: [
      { name: "陳O安", joinedAt: "2026-07-30" },
      { name: "林O妤", joinedAt: "2026-08-05" },
    ],
    level2Members: [{ name: "黃O豪", invitedBy: "陳O安", joinedAt: "2026-08-13" }],
  },
  "cm-senshan": {
    venue: "森山寫照",
    totalSpread: 2,
    level1: 1,
    level2: 1,
    conversions: 1,
    monthlyBonus: 1260,
    partners: [
      { name: "何O瑄", level: "第一層", orders: 1, bonus: 960 },
      { name: "楊O廷", level: "第二層", orders: 0, bonus: 0 },
    ],
    level1Members: [{ name: "何O瑄", joinedAt: "2026-08-06" }],
    level2Members: [{ name: "楊O廷", invitedBy: "何O瑄", joinedAt: "2026-08-17" }],
  },
  "cm-yunxiu": {
    venue: "雲岫海景渡假會館",
    totalSpread: 2,
    level1: 1,
    level2: 1,
    conversions: 0,
    monthlyBonus: 480,
    partners: [
      { name: "郭O筑", level: "第一層", orders: 0, bonus: 0 },
      { name: "許O傑", level: "第二層", orders: 0, bonus: 0 },
    ],
    level1Members: [{ name: "郭O筑", joinedAt: "2026-08-12" }],
    level2Members: [{ name: "許O傑", invitedBy: "郭O筑", joinedAt: "2026-08-21" }],
  },
  "cm-songxiang": {
    venue: "淞湘卉館",
    totalSpread: 3,
    level1: 2,
    level2: 1,
    conversions: 0,
    monthlyBonus: 720,
    partners: [
      { name: "蔡O慈", level: "第一層", orders: 0, bonus: 0 },
      { name: "周O倫", level: "第一層", orders: 0, bonus: 0 },
      { name: "吳O恩", level: "第二層", orders: 0, bonus: 0 },
    ],
    level1Members: [
      { name: "蔡O慈", joinedAt: "2026-08-19" },
      { name: "周O倫", joinedAt: "2026-08-22" },
    ],
    level2Members: [{ name: "吳O恩", invitedBy: "周O倫", joinedAt: "2026-08-26" }],
  },
};


/** 全站彙總＝4 位社群管理員加總（避免與各館數字兜不起來） */
const GLOBAL_SPREAD = Object.values(MANAGER_PANELS).reduce(
  (acc, m) => ({
    total: acc.total + m.totalSpread,
    level1: acc.level1 + m.level1,
    level2: acc.level2 + m.level2,
    conversions: acc.conversions + m.conversions,
  }),
  { total: 0, level1: 0, level2: 0, conversions: 0 },
);

const GLOBAL_MANAGER_BONUS = Object.values(MANAGER_PANELS).reduce((s, m) => s + m.monthlyBonus, 0);

const PLATFORM_REVENUE_STATS = [
  { title: "台灣旅圖抽成比例", value: "2% - 4%", icon: TrendingUp, variant: "coral" as const },
  { title: "人客多抽成比例", value: "3% - 4%", icon: Wallet, variant: "cyan" as const },
  { title: "本月台灣旅圖抽成金額", value: "NT$ 3,760", icon: LayoutDashboard, variant: "blue" as const },
  { title: "本月人客多抽成金額", value: "NT$ 5,900", icon: Users, variant: "purple" as const },
];

const PLATFORM_REVENUE_ROWS = [
  { project: "多渠道創作者導流", lvtu: "2%", lakeze: "3%", amount: 8100 },
  { project: "社群裂變推廣", lvtu: "2%", lakeze: "4%", amount: 1560 },
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

/** 每位創作者可合作的館別（前端常數） */
const KOL_VENUE_OPTIONS: Record<string, string[]> = {
  "093330": ["森山寫照", "淞湘卉館"],
  DICKYLEMON22: ["旅行日-光", "旅行日-DAIDODO"],
  BRYAN1014: ["雲岫海景渡假會館"],
  MIKALLXX: ["雲岫海景渡假會館", "奧莉薇雅生活小酒店"],
  XUANKEKE: ["淞湘卉館", "森山寫照"],
  SUESUE: ["旅行日-DAIDODO"],
  OREO0126: ["奧莉薇雅生活小酒店", "旅行日-光"],
  STARMONARCH: ["雲岫海景渡假會館", "淞湘卉館"],
};

type CodeHistoryRow = {
  id: string;
  code: string;
  kolName: string;
  venue: string;
  mode: "自動" | "手動";
  createdAt: string;
};

const INITIAL_CODE_HISTORY: CodeHistoryRow[] = [
  {
    id: "h1",
    code: "OREO0126",
    kolName: "Oreo｜建築旅遊部落客",
    venue: "奧莉薇雅生活小酒店",
    mode: "手動",
    createdAt: "2026-08-24 14:12",
  },
  {
    id: "h2",
    code: "XUANK7QP",
    kolName: "竹軒｜Mixx質感電商",
    venue: "淞湘卉館",
    mode: "自動",
    createdAt: "2026-08-21 10:38",
  },
  {
    id: "h3",
    code: "DICKYLEMON22",
    kolName: "餓犬Dicky",
    venue: "旅行日-光",
    mode: "手動",
    createdAt: "2026-08-18 19:05",
  },
  {
    id: "h4",
    code: "MIKA4TXB",
    kolName: "Mika｜今晚住這裡·旅宿探索中",
    venue: "雲岫海景渡假會館",
    mode: "自動",
    createdAt: "2026-08-15 09:47",
  },
  {
    id: "h5",
    code: "093330",
    kolName: "仙女他媽（施怡君）",
    venue: "森山寫照",
    mode: "手動",
    createdAt: "2026-08-13 16:24",
  },
  {
    id: "h6",
    code: "BRYAN1014",
    kolName: "Bryan Aka黑熊他爸🐾",
    venue: "雲岫海景渡假會館",
    mode: "手動",
    createdAt: "2026-08-10 11:52",
  },
  {
    id: "h7",
    code: "SUESU9KM",
    kolName: "蘇蘇",
    venue: "旅行日-DAIDODO",
    mode: "自動",
    createdAt: "2026-08-08 20:16",
  },
  {
    id: "h8",
    code: "STARM3VQ",
    kolName: "明星煌",
    venue: "雲岫海景渡假會館",
    mode: "自動",
    createdAt: "2026-08-05 13:09",
  },
];


function nowStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

  const [identity, setIdentity] = useState(ADMIN_IDENTITY);
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
  const managerPanel = MANAGER_PANELS[identity] ?? null;
  const isManagerView = managerPanel !== null;

  const selectedKol = KOL_PANELS[identity] ? identity : MOCK_KOLS[0].cidCode;


  const selectedKolName = useMemo(
    () => MOCK_KOLS.find((k) => k.cidCode === selectedKol)?.name ?? "",
    [selectedKol],
  );

  const panel = isAdminView ? ADMIN_PANEL : KOL_PANELS[identity] ?? ADMIN_PANEL;

  // Demo 用途的前端可視性規則（非真實權限驗證）
  const canSeeD1 = isAdminView || !isManagerView;
  const canSeeD2 = isAdminView || isManagerView;
  const visibleTabs = [
    ...(canSeeD1 ? ["d1"] : []),
    ...(canSeeD2 ? ["d2"] : []),
    ...(isAdminView ? ["revenue"] : []),
  ];

  const [activeTab, setActiveTab] = useState("d1");
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) setActiveTab(visibleTabs[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeeD1, canSeeD2, isAdminView, activeTab]);


  const managerInviteCodes = useMemo(() => {
    const manager = COMMUNITY_MANAGERS.find((m) => m.id === identity);
    if (!manager) return MOCK_INVITE_CODES;
    return MOCK_INVITE_CODES.filter((c) => c.owner === manager.label);
  }, [identity]);

  const spreadStats = managerPanel
    ? {
        total: managerPanel.totalSpread,
        conversions: managerPanel.conversions,
        levels: [
          { level: 1, label: "第一層擴散", people: managerPanel.level1, note: "由社群管理員直接邀請" },
          { level: 2, label: "第二層擴散", people: managerPanel.level2, note: "由第一層成員再邀請" },
        ],
      }
    : {
        total: GLOBAL_SPREAD.total,
        conversions: GLOBAL_SPREAD.conversions,
        levels: [
          { level: 1, label: "第一層擴散", people: GLOBAL_SPREAD.level1, note: "由社群管理員直接邀請" },
          { level: 2, label: "第二層擴散", people: GLOBAL_SPREAD.level2, note: "由第一層成員再邀請" },
        ],
      };

  const conversionRate =
    spreadStats.total > 0
      ? ((spreadStats.conversions / spreadStats.total) * 100).toFixed(1)
      : "0.0";


  const [codeHistory, setCodeHistory] = useState<CodeHistoryRow[]>(INITIAL_CODE_HISTORY);
  // KOL 身份只看得到自己的折扣碼；總覽維持全站清單
  const visibleCodeHistory = useMemo(
    () => (isAdminView ? codeHistory : codeHistory.filter((h) => h.kolName === selectedKolName)),
    [codeHistory, isAdminView, selectedKolName],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [formKol, setFormKol] = useState(selectedKol);
  const [formVenue, setFormVenue] = useState("");
  const [formMode, setFormMode] = useState<"auto" | "manual">("auto");
  const [formCode, setFormCode] = useState("");
  const [formError, setFormError] = useState("");

  const formVenueOptions = KOL_VENUE_OPTIONS[formKol] ?? [];
  const formKolName = MOCK_KOLS.find((k) => k.cidCode === formKol)?.name ?? "";

  const openCreateDialog = () => {
    setFormKol(selectedKol);
    setFormVenue(KOL_VENUE_OPTIONS[selectedKol]?.[0] ?? "");
    setFormMode("auto");
    setFormCode("");
    setFormError("");
    setCreateOpen(true);
  };

  const handleCreateCode = () => {
    if (formMode === "manual" && !formCode.trim()) {
      setFormError("請輸入折扣碼");
      return;
    }
    const code = formMode === "auto" ? buildCidCode(formKolName) : formCode.trim().toUpperCase();
    setGeneratedCode(code);
    setCodeHistory((prev) => [
      {
        id: `${code}-${Date.now()}`,
        code,
        kolName: formKolName,
        venue: formVenue || formVenueOptions[0] || "—",
        mode: formMode === "auto" ? "自動" : "手動",
        createdAt: nowStamp(),
      },
      ...prev,
    ]);
    setCreateOpen(false);
    toast.success("已於館別後台建立折扣代碼");
  };

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
              <Select
                value={identity}
                onValueChange={(v) => {
                  setIdentity(v);
                  setGeneratedCode(null);
                }}
              >
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>創作者</SelectLabel>
                    {KOL_IDENTITIES.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>社群管理員</SelectLabel>
                    {MANAGER_IDENTITIES.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>總覽</SelectLabel>
                    <SelectItem value={ADMIN_IDENTITY}>系統管理員／總覽</SelectItem>
                  </SelectGroup>
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
                  <DropdownMenuItem asChild className="cursor-pointer py-3">
                    <a
                      href={LABOR_FORM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center"
                    >
                      <UserCircle className="mr-2 h-4 w-4" />
                      填寫勞報單
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            {canSeeD1 && <TabsTrigger value="d1">創作者導流</TabsTrigger>}
            {canSeeD2 && <TabsTrigger value="d2">社群裂變</TabsTrigger>}
            {isAdminView && <TabsTrigger value="revenue">平台營收</TabsTrigger>}
          </TabsList>

          {/* D1 */}
          {canSeeD1 && (
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
                    {isAdminView ? (
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
                    ) : (
                      <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                        {selectedKolName}
                      </div>
                    )}
                  </div>
                  <Button onClick={openCreateDialog}>產生折扣碼</Button>
                </div>

                {generatedCode && (
                  <div className="rounded-lg border border-primary/30 bg-secondary/60 p-4">
                    <p className="text-xs text-muted-foreground">{selectedKolName} 的專屬折扣碼</p>
                    <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-primary">
                      {generatedCode}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium">歷史已建立折扣碼</p>
                  {visibleCodeHistory.length === 0 ? (
                    <Card>
                      <CardContent className="p-8 text-center text-sm text-muted-foreground">
                        尚無折扣碼紀錄
                      </CardContent>
                    </Card>
                  ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>折扣碼</TableHead>
                          <TableHead>對應 KOL</TableHead>
                          <TableHead>對應館別</TableHead>
                          <TableHead>建立方式</TableHead>
                          <TableHead>建立時間</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleCodeHistory.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell className="font-mono whitespace-nowrap">{h.code}</TableCell>
                            <TableCell className="whitespace-nowrap">{h.kolName}</TableCell>
                            <TableCell className="whitespace-nowrap">{h.venue}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{h.mode}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap tabular-nums">
                              {h.createdAt}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">使用此折扣碼的訂單</p>
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
                </div>

                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>建立折扣碼</DialogTitle>
                      <DialogDescription>選擇創作者與館別，並決定折扣碼建立方式</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">KOL 姓名</Label>
                        {isAdminView ? (
                          <Select
                            value={formKol}
                            onValueChange={(v) => {
                              setFormKol(v);
                              setFormVenue(KOL_VENUE_OPTIONS[v]?.[0] ?? "");
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
                        ) : (
                          <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                            {formKolName}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">館別</Label>
                        <Select value={formVenue} onValueChange={setFormVenue}>
                          <SelectTrigger>
                            <SelectValue placeholder="選擇館別" />
                          </SelectTrigger>
                          <SelectContent>
                            {formVenueOptions.map((v) => (
                              <SelectItem key={v} value={v}>
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">建立方式</Label>
                        <RadioGroup
                          value={formMode}
                          onValueChange={(v) => {
                            setFormMode(v as "auto" | "manual");
                            setFormError("");
                          }}
                          className="gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="auto" id="code-mode-auto" />
                            <Label htmlFor="code-mode-auto" className="font-normal">
                              自動建立（系統隨機產生）
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="manual" id="code-mode-manual" />
                            <Label htmlFor="code-mode-manual" className="font-normal">
                              手動輸入
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      {formMode === "manual" && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">折扣碼</Label>
                          <Input
                            value={formCode}
                            onChange={(e) => {
                              setFormCode(e.target.value);
                              setFormError("");
                            }}
                            placeholder="例如 LAKEZE2026"
                            className="font-mono"
                          />
                          {formError && <p className="text-xs text-destructive">{formError}</p>}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateOpen(false)}>
                        取消
                      </Button>
                      <Button onClick={handleCreateCode}>確認建立</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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

            {isAdminView && (
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
            )}

            {isAdminView && (
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
            )}
          </TabsContent>
          )}

          {/* D2 */}
          {canSeeD2 && (
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
                      {managerInviteCodes.map((c) => (
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
                <div className={cn("grid gap-3 sm:grid-cols-2", managerPanel && "lg:grid-cols-3")}>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">總擴散人數</p>
                    <p className="mt-1 text-2xl font-bold">{spreadStats.total}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">轉換率</p>
                    <p className="mt-1 text-2xl font-bold text-primary">
                      {conversionRate}%（{spreadStats.conversions} / {spreadStats.total}）
                    </p>
                  </Card>
                  {managerPanel && (
                    <Card className="p-4">
                      <p className="text-sm text-muted-foreground">本月管理員獎金</p>
                      <p className="mt-1 text-2xl font-bold text-primary">
                        NT$ {managerPanel.monthlyBonus.toLocaleString()}
                      </p>
                    </Card>
                  )}
                </div>
                {isAdminView && !managerPanel && (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>館別（社群管理員）</TableHead>
                          <TableHead className="text-right">第一層人數</TableHead>
                          <TableHead className="text-right">第二層人數</TableHead>
                          <TableHead className="text-right">總擴散人數</TableHead>
                          <TableHead className="text-right">本月管理員獎金</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(MANAGER_PANELS).map(([id, m]) => (
                          <TableRow key={id}>
                            <TableCell className="whitespace-nowrap">{m.venue}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.level1}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.level2}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.totalSpread}</TableCell>
                            <TableCell className="text-right tabular-nums text-primary">
                              NT$ {m.monthlyBonus.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-medium">
                          <TableCell className="whitespace-nowrap">全站合計</TableCell>
                          <TableCell className="text-right tabular-nums">{GLOBAL_SPREAD.level1}</TableCell>
                          <TableCell className="text-right tabular-nums">{GLOBAL_SPREAD.level2}</TableCell>
                          <TableCell className="text-right tabular-nums">{GLOBAL_SPREAD.total}</TableCell>
                          <TableCell className="text-right tabular-nums text-primary">
                            NT$ {GLOBAL_MANAGER_BONUS.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
                {isAdminView && !managerPanel && (
                  <Accordion type="multiple" className="rounded-lg border px-3">
                    {Object.entries(MANAGER_PANELS).map(([id, m]) => (
                      <AccordionItem key={id} value={id}>
                        <AccordionTrigger className="text-sm">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{m.venue}</span>
                            <span className="text-xs text-muted-foreground">
                              第一層 {m.level1} 人 · 第二層 {m.level2} 人
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3">
                          <div className="rounded-lg border bg-card p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">第一層擴散</span>
                              <span className="tabular-nums text-primary">{m.level1} 人</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">由社群管理員直接邀請</p>
                            {m.level1Members.length > 0 && (
                              <ul className="mt-3 divide-y rounded-md border bg-background">
                                {m.level1Members.map((mem) => (
                                  <li
                                    key={mem.name}
                                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                                  >
                                    <span className="font-medium">{mem.name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      加入日期 {mem.joinedAt}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="ml-6 rounded-lg border border-dashed bg-card p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">第二層擴散</span>
                              <span className="tabular-nums text-primary">{m.level2} 人</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">由第一層成員再邀請</p>
                            {m.level2Members.length > 0 && (
                              <ul className="mt-3 space-y-1">
                                {m.level2Members.map((mem) => (
                                  <li
                                    key={mem.name}
                                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
                                  >
                                    <span className="text-foreground/80">{mem.name}</span>
                                    <span>· 由 {mem.invitedBy} 邀請</span>
                                    <span>· {mem.joinedAt} 加入</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
                <ul className="space-y-2">
                  {spreadStats.levels.map((n) => (
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
                      {managerPanel && n.level === 1 && managerPanel.level1Members.length > 0 && (
                        <ul className="mt-3 divide-y rounded-md border bg-background">
                          {managerPanel.level1Members.map((m) => (
                            <li
                              key={m.name}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                            >
                              <span className="font-medium">{m.name}</span>
                              <span className="text-xs text-muted-foreground">
                                加入日期 {m.joinedAt}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {managerPanel && n.level === 2 && managerPanel.level2Members.length > 0 && (
                        <ul className="mt-3 space-y-1">
                          {managerPanel.level2Members.map((m) => (
                            <li
                              key={m.name}
                              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground"
                            >
                              <span className="text-foreground/80">{m.name}</span>
                              <span>· 由 {m.invitedBy} 邀請</span>
                              <span>· {m.joinedAt} 加入</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>

                  ))}
                </ul>
              </CardContent>
            </Card>

            {managerPanel && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-5 w-5 text-primary" />
                    裂變夥伴績效清單
                  </CardTitle>
                  <CardDescription>{managerPanel.venue} 社群的夥伴帶單與獎金表現</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>夥伴姓名</TableHead>
                          <TableHead>加入層級</TableHead>
                          <TableHead className="text-right">帶來訂單數</TableHead>
                          <TableHead className="text-right">獎金金額</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {managerPanel.partners.map((p) => (
                          <TableRow key={p.name}>
                            <TableCell className="whitespace-nowrap">{p.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{p.level}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{p.orders}</TableCell>
                            <TableCell className="text-right tabular-nums text-primary">
                              NT$ {p.bonus.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}


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
          )}

          {/* 平台營收（僅總覽身份） */}
          {isAdminView && (
            <TabsContent value="revenue" className="mt-4 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wallet className="h-5 w-5 text-primary" />
                    平台營收
                  </CardTitle>
                  <CardDescription>台灣旅圖與人客多之平台抽成總覽</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {PLATFORM_REVENUE_STATS.map((s) => (
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

                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>專案類型</TableHead>
                          <TableHead>台灣旅圖抽成%</TableHead>
                          <TableHead>人客多抽成%</TableHead>
                          <TableHead className="text-right">本月抽成金額</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {PLATFORM_REVENUE_ROWS.map((r) => (
                          <TableRow key={r.project}>
                            <TableCell className="whitespace-nowrap">{r.project}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{r.lvtu}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{r.lakeze}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-primary">
                              NT$ {r.amount.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

        </Tabs>
      </div>
    </div>
  );
}
