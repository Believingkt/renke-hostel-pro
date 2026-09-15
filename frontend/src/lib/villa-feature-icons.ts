import {
  Wifi,
  Car,
  Utensils,
  Mountain,
  Trees,
  Baby,
  Dog,
  Waves,
  Flame,
  Music,
  Snowflake,
  Heart,
  ShieldCheck,
  Coffee,
  Bath,
  Tv,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface VillaFeatureTag {
  icon: string;
  label: string;
}

export const VILLA_FEATURE_ICON_OPTIONS: { value: string; icon: LucideIcon; defaultLabel: string }[] = [
  { value: "waves", icon: Waves, defaultLabel: "戲水設施" },
  { value: "wifi", icon: Wifi, defaultLabel: "免費 Wi-Fi" },
  { value: "flame", icon: Flame, defaultLabel: "烤肉/壁爐" },
  { value: "baby", icon: Baby, defaultLabel: "親子友善" },
  { value: "car", icon: Car, defaultLabel: "免費停車" },
  { value: "utensils", icon: Utensils, defaultLabel: "餐飲服務" },
  { value: "mountain", icon: Mountain, defaultLabel: "景觀房" },
  { value: "trees", icon: Trees, defaultLabel: "陽台/庭院" },
  { value: "dog", icon: Dog, defaultLabel: "寵物友善" },
  { value: "music", icon: Music, defaultLabel: "影音設備" },
  { value: "snowflake", icon: Snowflake, defaultLabel: "空調" },
  { value: "coffee", icon: Coffee, defaultLabel: "咖啡/茶飲" },
  { value: "bath", icon: Bath, defaultLabel: "浴池/SPA" },
  { value: "tv", icon: Tv, defaultLabel: "電視/影音" },
  { value: "heart", icon: Heart, defaultLabel: "完善服務" },
  { value: "shield", icon: ShieldCheck, defaultLabel: "即時確認" },
  { value: "sparkles", icon: Sparkles, defaultLabel: "精選推薦" },
];

export const ICON_BY_VALUE: Record<string, LucideIcon> = Object.fromEntries(
  VILLA_FEATURE_ICON_OPTIONS.map((o) => [o.value, o.icon])
);

export const getVillaFeatureIcon = (value: string): LucideIcon =>
  ICON_BY_VALUE[value] || Sparkles;
