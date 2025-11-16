export interface Order {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
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
  room_types: {
    id: string;
    name: string;
  } | null;
}

export type QuickFilterType = "today_checkin" | "today_checkout" | "pending" | "unpaid" | "upcoming" | "";
