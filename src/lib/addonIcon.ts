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
  type LucideIcon,
} from "lucide-react";

/** 依加購方案名稱挑選合適圖示；找不到對應時回傳購物袋 */
export function addonIcon(name?: string | null): LucideIcon {
  const s = (name ?? "").toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => s.includes(k));

  if (has("寵物", "毛孩", "犬", "貓", "pet")) return PawPrint;
  if (has("加床", "床墊", "被", "bed")) return BedDouble;
  if (has("加人", "人數", "幼童", "孩童", "兒童")) return Users;
  if (has("烤肉", "bbq", "炭")) return Flame;
  if (has("餐", "早餐", "晚餐", "食", "meal")) return UtensilsCrossed;
  if (has("接送", "接機", "車", "包車", "transfer")) return Car;
  if (has("清潔", "打掃", "cleaning")) return Sparkle;
  if (has("門票", "票券", "ticket")) return Ticket;
  if (has("泳池", "湯屋", "溫泉", "spa")) return Waves;
  if (has("禮", "加碼", "布置")) return Gift;
  return ShoppingBag;
}
