import {
  LayoutDashboard,
  Star,
  ClipboardList,
  Coins,
  BarChart2,
  Handshake,
  Link as LinkIcon,
  Bell,
  Users,
  Tag,
  type LucideIcon,
} from "lucide-react";

export type TeamRole =
  | "super_admin"
  | "admin"
  | "closer"
  | "scout"
  | "scout_manager"
  | "video"
  | "franchise"
  | "franchise_manager"
  | "starlink"
  | "kol"
  | "owner"
  | "finance"
  | "venue_manager";

export const TEAM_ROLES: TeamRole[] = [
  "super_admin",
  "admin",
  "closer",
  "scout",
  "scout_manager",
  "video",
  "franchise",
  "franchise_manager",
  "starlink",
  "kol",
  "owner",
  "finance",
  "venue_manager",
];

export interface TeamMenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** 若提供，則使用者擁有任一角色才顯示 */
  allowedRoles?: TeamRole[];
}

export const TEAM_MENU: TeamMenuItem[] = [
  { title: "首頁", url: "/team", icon: LayoutDashboard },
  { title: "KOL 星探", url: "/team/kol", icon: Star },
  { title: "訂單資訊", url: "/team/orders", icon: ClipboardList },
  {
    title: "廣告追蹤",
    url: "/team/ads",
    icon: BarChart2,
    allowedRoles: ["super_admin", "admin", "scout_manager"],
  },
  {
    title: "特許加盟",
    url: "/team/franchise",
    icon: Handshake,
    allowedRoles: ["franchise"],
  },
  {
    title: "星鏈",
    url: "/team/starlink",
    icon: LinkIcon,
    allowedRoles: ["starlink"],
  },
  {
    title: "民宿業績通報",
    url: "/team/notification",
    icon: Bell,
    allowedRoles: ["super_admin", "admin"],
  },
  {
    title: "獎金管理",
    url: "/team/commission",
    icon: Coins,
    allowedRoles: ["super_admin", "admin", "finance"],
  },
  {
    title: "成員管理",
    url: "/team/members",
    icon: Users,
    allowedRoles: ["super_admin", "admin"],
  },
  {
    title: "折扣碼設定",
    url: "/team/kol/venue-confirm",
    icon: Tag,
    allowedRoles: ["super_admin", "admin", "venue_manager"],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/team": "個人業績總覽",
  "/team/members": "成員管理",
  "/team/kol/venue-confirm": "折扣碼設定管理",
  "/team/kol": "KOL 星探管理",
  "/team/orders": "訂單補充資料",
  "/team/commission": "獎金管理",
  "/team/ads": "廣告追蹤",
  "/team/notification": "業績通報設定",
  "/team/franchise": "特許加盟",
  "/team/starlink": "星鏈",
};
