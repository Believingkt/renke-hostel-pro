export interface Order {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  customer_id: string | null;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  payment_status: string;
  total_price: number;
  discount_amount: number;
  discount_code: string | null;
  final_price: number;
  deposit_amount: number;
  paid_amount: number;
  payment_method: string | null;
  deposit_payment_method: string | null;
  balance_payment_method: string | null;
  atm_vacc_no: string | null;
  atm_vacc_bank_code: string | null;
  atm_expire_at: string | null;
  notes: string | null;
  order_date: string;
  guest_count: number;
  meal_plan: string | null;
  meal_plan_details: unknown;
  payment_link_created_at?: string | null;
  order_source: string;
  room_types: {
    id: string;
    name: string;
  } | null;
}

export interface CustomMealPlan {
  id: string;
  name: string;
  description: string;
}

export type QuickFilterType = "today_checkin" | "today_checkout" | "pending" | "unpaid" | "upcoming" | "";
