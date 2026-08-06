export interface TravelerIdentity {
  type: "member" | "guest" | "discount_code" | string;
  ref: string;
  label?: string | null;
  accommodation_id?: string | null;
  bound_at?: string | null;
}

export interface TravelerConsumption {
  total_amount?: number;
  order_count?: number;
  last_order_at?: string | null;
  avg_amount?: number;
  used_discount_codes?: string[];
}

export interface TravelerProfile {
  id: string;
  user_id: string | null;
  customer_key: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  bound_identities: TravelerIdentity[];
  custom_needs: string[];
  interest_tags: string[];
  consumption: TravelerConsumption;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export function identityLabel(type: string): string {
  switch (type) {
    case "member":
      return "會員";
    case "guest":
      return "訪客";
    case "discount_code":
      return "折扣碼";
    default:
      return type;
  }
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-TW", { hour12: false });
}
