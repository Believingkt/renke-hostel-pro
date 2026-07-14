// Preview / demo mode for the member center.
// Activate by visiting any /member/* route with ?preview=1
// (the flag is stored in sessionStorage so it persists across navigation).
//
// When active, member pages skip Supabase calls and render mock data so we
// can adjust UI without logging in.

const KEY = "member_preview_mode";

export function initMemberPreviewFromUrl(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const flag = params.get("preview");
  if (flag === "1") sessionStorage.setItem(KEY, "1");
  if (flag === "0") sessionStorage.removeItem(KEY);
}

export function isMemberPreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(KEY) === "1") return true;
    const params = new URLSearchParams(window.location.search);
    return params.get("preview") === "1";
  } catch {
    return false;
  }
}

// ---------- Mock data ----------

export const mockMemberName = "預覽會員";
export const mockMemberId = "preview-member-id";

export const mockOrders = [
  {
    id: "mock-o-1",
    order_number: "A2B3C4D5",
    order_date: "2026-06-15",
    check_in_date: "2026-08-10",
    check_out_date: "2026-08-12",
    order_status: "confirmed",
    final_price: 8800,
    guest_name: "王小明",
    guest_count: 4,
    accommodation_id: "mock-acc-1",
    accommodation_name: "森山民宿",
    room_type_name: "山景雙人房",
    room_photo_url: null as string | null,
  },
  {
    id: "mock-o-2",
    order_number: "B3C4D5E6",
    order_date: "2026-05-20",
    check_in_date: "2026-07-05",
    check_out_date: "2026-07-07",
    order_status: "confirmed",
    final_price: 12600,
    guest_name: "王小明",
    guest_count: 6,
    accommodation_id: "mock-acc-2",
    accommodation_name: "雲岫海景",
    room_type_name: "海景四人房",
    room_photo_url: null,
  },
  {
    id: "mock-o-3",
    order_number: "C4D5E6F7",
    order_date: "2026-03-01",
    check_in_date: "2026-04-10",
    check_out_date: "2026-04-12",
    order_status: "checked_out",
    final_price: 7200,
    guest_name: "王小明",
    guest_count: 2,
    accommodation_id: "mock-acc-3",
    accommodation_name: "田松 Villa",
    room_type_name: "獨立小屋",
    room_photo_url: null,
  },
  {
    id: "mock-o-4",
    order_number: "D5E6F7G8",
    order_date: "2026-01-15",
    check_in_date: "2026-02-20",
    check_out_date: "2026-02-21",
    order_status: "cancelled",
    final_price: 5400,
    guest_name: "王小明",
    guest_count: 2,
    accommodation_id: "mock-acc-1",
    accommodation_name: "森山民宿",
    room_type_name: "山景雙人房",
    room_photo_url: null,
  },
];

export const mockCoupons = [
  {
    id: "mock-c-1",
    code: "SUMMER500",
    coupon_type: "fixed",
    coupon_value: 500,
    scope: "platform",
    min_order_amount: 3000,
    valid_from: "2026-06-01",
    valid_until: "2026-09-30",
    accommodation_name: null as string | null,
    is_distributed: true,
    distribution_note: "夏季會員專屬" as string | null,
  },
  {
    id: "mock-c-2",
    code: "WEEKEND10",
    coupon_type: "percentage",
    coupon_value: 10,
    scope: "platform",
    min_order_amount: 0,
    valid_from: "2026-01-01",
    valid_until: "2026-12-31",
    accommodation_name: null,
    is_distributed: false,
    distribution_note: null,
  },
  {
    id: "mock-c-3",
    code: "SENSAN800",
    coupon_type: "fixed",
    coupon_value: 800,
    scope: "accommodation",
    min_order_amount: 5000,
    valid_from: "2026-06-01",
    valid_until: "2026-08-31",
    accommodation_name: "森山民宿",
    is_distributed: false,
    distribution_note: null,
  },
];

export const mockPoints = {
  balance: 3250,
  lifetime_earned: 5800,
  lifetime_used: 2550,
  transactions: [
    {
      id: "mock-t-1",
      type: "earn_order",
      amount: 880,
      balance_after: 3250,
      description: "訂單 A2B3C4D5 消費回饋",
      created_at: "2026-06-15T10:00:00Z",
    },
    {
      id: "mock-t-2",
      type: "redeem",
      amount: -500,
      balance_after: 2370,
      description: "折抵訂單 B3C4D5E6",
      created_at: "2026-05-20T14:30:00Z",
    },
    {
      id: "mock-t-3",
      type: "earn_event",
      amount: 200,
      balance_after: 2870,
      description: "生日禮金",
      created_at: "2026-05-01T09:00:00Z",
    },
    {
      id: "mock-t-4",
      type: "earn_order",
      amount: 720,
      balance_after: 2670,
      description: "訂單 C4D5E6F7 消費回饋",
      created_at: "2026-03-01T11:20:00Z",
    },
  ],
};

export const mockProfile = {
  id: mockMemberId,
  name: "王小明",
  phone: "0912345678",
  email: "preview@example.com",
  gender: "male",
  nationality: "台灣",
};
