/**
 * 民宿後台（PMS）左側選單設定 —— 單一真實來源。
 *
 * 這份設定同時被：
 *  - src/components/AppSidebar.tsx（畫面渲染）
 *  - src/constants/staffPermissions.ts（帳號管理的模組權限清單）
 * 使用，確保「新增分頁 → 權限設定自動出現該模組」不會再脫鉤。
 *
 * 新增分頁時只要在這裡加上 moduleKey，權限設定頁就會自動列出，
 * 且未定義預設值的模組一律預設「不可見」（super_admin / hotel_admin 不受限）。
 */
import {
  BarChart3,
  Bed,
  BookOpen,
  Calendar,
  ClipboardList,
  ConciergeBell,
  DollarSign,
  FileText,
  Globe,
  Headset,
  HelpCircle,
  Hotel,
  Image as ImageIcon,
  Info,
  KeyRound,
  LayoutPanelTop,
  Mail,
  Megaphone,
  Navigation,
  Package,
  Plug,
  Receipt,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface AdminSubMenuItem {
  title: string;
  url: string;
  icon?: LucideIcon;
}

export interface AdminMenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** 對應 staff 模組權限 key；未指定者所有人可見 */
  moduleKey?: string;
  subItems?: AdminSubMenuItem[];
}

export const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
  { title: "營運分析", url: "/admin", icon: BarChart3, moduleKey: "analytics" },
  { title: "櫃檯接待", url: "/admin/reception", icon: ConciergeBell, moduleKey: "reception" },
  {
    title: "訂單資訊",
    url: "/admin/orders",
    icon: ShoppingBag,
    moduleKey: "orders",
    subItems: [
      { title: "預訂管理", url: "/admin/room-inventory", icon: Package },
      { title: "訂單列表", url: "/admin/orders?tab=list", icon: ClipboardList },
      { title: "客服待辦", url: "/admin/manual-review", icon: Headset },
    ],
  },
  { title: "網紅團購", url: "/admin/group-buy", icon: Megaphone, moduleKey: "group_buy" },
  { title: "KOL 互惠額度", url: "/admin/kol-reciprocal-quota", icon: Sparkles, moduleKey: "kol_quota" },
  {
    title: "官網內容",
    url: "/admin/website-content",
    icon: Globe,
    moduleKey: "website_content",
    subItems: [
      { title: "首頁與 SEO 設定", url: "/admin/website-content?tab=basic-info", icon: Info },
      { title: "訂房頁標頭", url: "/admin/website-content?tab=villa-header", icon: LayoutPanelTop },
      { title: "設施服務", url: "/admin/website-content?tab=facilities", icon: Wrench },
      { title: "交通地圖", url: "/admin/website-content?tab=location", icon: Navigation },
      { title: "Google 評論", url: "/admin/website-content?tab=reviews", icon: Star },
      { title: "常見問題", url: "/admin/website-content?tab=faq", icon: HelpCircle },
      { title: "訂房須知", url: "/admin/website-content?tab=booking-info", icon: BookOpen },
      { title: "增值服務", url: "/admin/website-content?tab=addon-plans", icon: Package },
      { title: "精選照片", url: "/admin/website-content?tab=gallery", icon: ImageIcon },
      { title: "精選民宿卡片", url: "/admin/website-content?tab=portal-card", icon: Sparkles },
      { title: "訂房確認通知", url: "/admin/website-content?tab=email-notification", icon: Mail },
    ],
  },
  {
    title: "房型設施",
    url: "/admin/pricing",
    icon: Hotel,
    moduleKey: "pricing",
    subItems: [{ title: "房型管理", url: "/admin/pricing?tab=rooms", icon: Bed }],
  },
  {
    title: "房價庫存",
    url: "/admin/room-price-calendar",
    icon: DollarSign,
    moduleKey: "room_price",
    subItems: [
      { title: "庫存設定", url: "/admin/room-price-calendar", icon: DollarSign },
      { title: "房價價格設定", url: "/admin/projects", icon: TrendingUp },
      { title: "訂房入住方案", url: "/admin/packages", icon: Package },
      { title: "前台訂房價格", url: "/admin/package-price-calendar", icon: DollarSign },
      { title: "搜尋圖卡設定", url: "/admin/search-card", icon: Package },
      { title: "國定假日", url: "/admin/holidays", icon: Calendar },
    ],
  },
  {
    title: "顧客資料",
    url: "/admin/customers",
    icon: Users,
    moduleKey: "customers",
    subItems: [{ title: "客戶列表", url: "/admin/customers", icon: Users }],
  },
  { title: "網紅導購", url: "/admin/discount-codes", icon: Sparkles, moduleKey: "discount_codes" },
  { title: "業主月結", url: "/admin/owner-settlement", icon: FileText, moduleKey: "owner_settlement" },
  { title: "金流稽核", url: "/admin/payment-audit", icon: Receipt, moduleKey: "payment_audit" },
  { title: "購物商品", url: "/admin/addon-center", icon: Package, moduleKey: "addon_center" },
  { title: "通路管理", url: "/admin/channel-manager", icon: Plug, moduleKey: "channel_manager" },
  // AI 管家相關頁面已搬遷至總部後台（hq.lakeze.com）
  { title: "帳號管理", url: "/admin/accounts", icon: KeyRound, moduleKey: "accounts" },
];

/**
 * 由選單推導出的模組清單（依選單順序、同 key 合併標題）。
 * 帳號管理的權限設定直接使用這份清單，選單新增即自動同步。
 */
export function deriveModuleDefs(items: AdminMenuItem[] = ADMIN_MENU_ITEMS) {
  const order: string[] = [];
  const titles: Record<string, string[]> = {};
  items.forEach((item) => {
    if (!item.moduleKey) return;
    if (!titles[item.moduleKey]) {
      titles[item.moduleKey] = [];
      order.push(item.moduleKey);
    }
    titles[item.moduleKey].push(item.title);
  });
  return order.map((key) => ({ key, label: titles[key].join("・") }));
}
