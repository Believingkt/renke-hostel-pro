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
  paid_amount: number;
  notes: string | null;
  order_date: string;
  guest_count: number;
  meal_plan: string | null;
  meal_plan_details: unknown;
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
