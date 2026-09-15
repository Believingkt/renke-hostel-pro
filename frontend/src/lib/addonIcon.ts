import {
  BedDouble,
  PawPrint,
  UtensilsCrossed,
  Car,
  Sparkle,
  Ticket,
  Users,
  Waves,
  Flame,
  Gift,
  ShoppingBag,
  Cake,
  Wine,
  Baby,
  Bike,
  Camera,
  Music,
  Coffee,
  Tent,
  Dog,
  type LucideIcon,
} from "lucide-react";

/** 前台加購方案可選圖示清單（value 存入 addon_settings.icon_key） */
export const ADDON_ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "paw", label: "寵物（肉球）", icon: PawPrint },
  { value: "dog", label: "寵物（狗）", icon: Dog },
  { value: "bed", label: "加床／寢具", icon: BedDouble },
  { value: "users", label: "加人／人數", icon: Users },
  { value: "meal", label: "餐食", icon: UtensilsCrossed },
  { value: "bbq", label: "烤肉／營火", icon: Flame },
  { value: "car", label: "接送／交通", icon: Car },
  { value: "clean", label: "清潔／整理", icon: Sparkle },
  { value: "ticket", label: "門票／票券", icon: Ticket },
  { value: "waves", label: "泳池／湯屋", icon: Waves },
  { value: "gift", label: "禮品／布置", icon: Gift },
  { value: "cake", label: "蛋糕／慶生", icon: Cake },
  { value: "wine", label: "酒水", icon: Wine },
  { value: "coffee", label: "咖啡／茶飲", icon: Coffee },
  { value: "baby", label: "嬰幼兒用品", icon: Baby },
  { value: "bike", label: "單車／租借", icon: Bike },
  { value: "camera", label: "攝影／體驗", icon: Camera },
  { value: "music", label: "影音／娛樂", icon: Music },
  { value: "tent", label: "戶外／露營", icon: Tent },
  { value: "bag", label: "其他（購物袋）", icon: ShoppingBag },
];

const ICON_BY_KEY: Record<string, LucideIcon> = Object.fromEntries(
  ADDON_ICON_OPTIONS.map((o) => [o.value, o.icon])
);

/** 找不到對應時使用的預設圖示 */
export const DEFAULT_ADDON_ICON: LucideIcon = ShoppingBag;
export const DEFAULT_ADDON_ICON_LABEL = "其他（購物袋）";

/** 依加購方案名稱自動推測圖示 key；找不到時回傳 null */
export function guessAddonIconKey(name?: string | null): string | null {
  const s = (name ?? "").toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => s.includes(k));

  if (has("寵物", "毛孩", "犬", "貓", "pet")) return "paw";
  if (has("加床", "床墊", "被", "bed")) return "bed";
  if (has("加人", "人數", "幼童", "孩童", "兒童")) return "users";
  if (has("烤肉", "bbq", "炭")) return "bbq";
  if (has("餐", "早餐", "晚餐", "食", "meal")) return "meal";
  if (has("接送", "接機", "車", "包車", "transfer")) return "car";
  if (has("清潔", "打掃", "cleaning")) return "clean";
  if (has("門票", "票券", "ticket")) return "ticket";
  if (has("泳池", "湯屋", "溫泉", "spa")) return "waves";
  if (has("蛋糕", "慶生", "生日")) return "cake";
  if (has("酒", "調酒", "wine")) return "wine";
  if (has("咖啡", "茶")) return "coffee";
  if (has("嬰", "推車", "baby")) return "baby";
  if (has("單車", "腳踏車", "租借", "bike")) return "bike";
  if (has("攝影", "拍照", "寫真")) return "camera";
  if (has("音響", "投影", "卡拉", "娛樂")) return "music";
  if (has("露營", "戶外", "帳篷")) return "tent";
  if (has("禮", "加碼", "布置")) return "gift";
  return null;
}

/**
 * 解析加購方案圖示：優先使用手動指定的 icon_key，
 * 其次依名稱自動推測，最後回退預設購物袋。
 */
export function resolveAddonIcon(iconKey?: string | null, name?: string | null): LucideIcon {
  if (iconKey && ICON_BY_KEY[iconKey]) return ICON_BY_KEY[iconKey];
  const guessed = guessAddonIconKey(name);
  if (guessed && ICON_BY_KEY[guessed]) return ICON_BY_KEY[guessed];
  return DEFAULT_ADDON_ICON;
}

/** 目前圖示的來源：manual = 手動指定、auto = 依名稱推測、fallback = 預設圖 */
export function addonIconSource(iconKey?: string | null, name?: string | null): "manual" | "auto" | "fallback" {
  if (iconKey && ICON_BY_KEY[iconKey]) return "manual";
  if (guessAddonIconKey(name)) return "auto";
  return "fallback";
}

/** 舊版 API：依名稱挑圖示（保留相容） */
export function addonIcon(name?: string | null): LucideIcon {
  return resolveAddonIcon(null, name);
}
