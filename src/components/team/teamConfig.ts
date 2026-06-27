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
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

export type TeamRole =
  | "super_admin"
  | "admin"
  | "am"
  | "closer"
  | "scout"
  | "scout_manager"
  | "video"
  | "franchise"
  | "franchise_internal"
  | "franchise_external"
  | "franchise_manager"
  | "starlink"
  | "owner"
  | "finance"
  | "venue_manager";

export const TEAM_ROLES: TeamRole[] = [
  "super_admin",
  "admin",
  "am",
  "closer",
  "scout",
  "scout_manager",
  "video",
  "franchise_internal",
  "franchise_external",
  "franchise_manager",
  "starlink",
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
  {
    title: "KOL 星探",
    url: "/team/kol",
    icon: Star,
    allowedRoles: ["scout", "scout_manager", "hotel_admin", "super_admin"] as TeamRole[],
  },
  {
    title: "成交大師",
    url: "/team/orders",
    icon: ClipboardList,
    allowedRoles: [
      "super_admin",
      "admin",
      "hotel_admin",
      "closer",
      "video",
      "scout_manager",
      "scout",
    ] as TeamRole[],
  },

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
    allowedRoles: ["franchise_internal", "franchise_external", "franchise_manager"],
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
    allowedRoles: ["super_admin", "admin", "scout_manager"],
  },
  {
    title: "外部導購連結",
    url: "/team/kol/venue-confirm",
    icon: Tag,
    allowedRoles: ["super_admin", "admin", "venue_manager"],
  },
  {
    title: "LINE群設定",
    url: "/team/lineoa",
    icon: MessageCircle,
    allowedRoles: ["super_admin", "admin", "am"],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/team": "個人業績總覽",
  "/team/members": "成員管理",
  "/team/kol/venue-confirm": "外部導購連結",
  "/team/kol": "KOL 星探管理",
  "/team/orders": "訂單補充資料",
  "/team/commission": "獎金管理",
  "/team/ads": "廣告追蹤",
  "/team/notification": "業績通報設定",
  "/team/franchise": "特許加盟",
  "/team/starlink": "星鏈",
  "/team/lineoa": "LINE群設定",
};
