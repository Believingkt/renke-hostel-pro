export interface Order {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  payment_status: string;
  final_price: number;
  paid_amount: number;
  notes: string | null;
  order_date: string;
  room_types: {
    name: string;
  } | null;
}

export type QuickFilterType = "today_checkin" | "today_checkout" | "pending" | "unpaid" | "upcoming" | "";
