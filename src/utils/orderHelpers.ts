/**
 * Check if an order's payment link has expired (3 days after generation).
 */
export const isPaymentLinkExpired = (paymentLinkCreatedAt: string | null | undefined): boolean => {
  if (!paymentLinkCreatedAt) return false;
  const created = new Date(paymentLinkCreatedAt);
  if (isNaN(created.getTime())) return false;
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  return Date.now() > created.getTime() + threeDaysMs;
};

/**
 * Get effective payment status, considering overdue logic.
 * If the order has an unpaid/deposit_paid status and the payment link has expired, show "overdue".
 */
export const getEffectivePaymentStatus = (
  paymentStatus: string,
  paymentLinkCreatedAt?: string | null
): string => {
  const unpaidStatuses = ['unpaid', 'pending_payment'];
  if (unpaidStatuses.includes(paymentStatus) && isPaymentLinkExpired(paymentLinkCreatedAt)) {
    return 'overdue';
  }
  return paymentStatus;
};

export const getPaymentStatusConfig = (status: string) => {
  const statusMap: Record<string, { label: string; className: string }> = {
    unpaid: { label: "未付款", className: "bg-red-100 text-red-700 border-red-200" },
    pending_payment: { label: "未付款", className: "bg-red-100 text-red-700 border-red-200" },
    deposit_paid: { label: "已付訂金", className: "bg-orange-100 text-orange-700 border-orange-200" },
    paid: { label: "已付清", className: "bg-primary/10 text-primary border-primary/20" },
    overdue: { label: "已逾期", className: "bg-red-100 text-red-700 border-red-200" },
    refunded: { label: "已退款", className: "bg-gray-100 text-gray-700 border-gray-200" },
    partial_refunded: { label: "部分退款", className: "bg-amber-100 text-amber-700 border-amber-200" },
  };
  return statusMap[status] || { label: status, className: "bg-muted text-muted-foreground border-border" };
};

export const getOrderStatusConfig = (status: string) => {
  const statusMap: Record<string, { label: string; className: string }> = {
    hold: { label: "保留中", className: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    pending: { label: "待確認", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    confirmed: { label: "已確認", className: "bg-blue-100 text-blue-700 border-blue-200" },
    checked_in: { label: "已入住", className: "bg-purple-100 text-purple-700 border-purple-200" },
    checked_out: { label: "已退房", className: "bg-gray-100 text-gray-700 border-gray-200" },
    cancelled: { label: "已取消", className: "bg-red-100 text-red-700 border-red-200" },
  };
  return statusMap[status] || { label: status, className: "bg-muted text-muted-foreground border-border" };
};

export const getOrderSourceConfig = (source: string, otaCode?: string | null) => {
  const sourceMap: Record<string, { label: string; className: string }> = {
    website: { label: "官網訂房", className: "bg-blue-100 text-blue-700 border-blue-200" },
    manual: { label: "現場訂房", className: "bg-purple-100 text-purple-700 border-purple-200" },
    line: { label: "Line@", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    agoda: { label: "Agoda", className: "bg-green-100 text-green-700 border-green-200" },
    booking: { label: "Booking", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
    trip: { label: "Trip", className: "bg-orange-100 text-orange-700 border-orange-200" },
    travel_agency: { label: "旅行社", className: "bg-teal-100 text-teal-700 border-teal-200" },
    kol: { label: "KOL互惠", className: "bg-pink-100 text-pink-700 border-pink-200" },
    points_starchain: { label: "星鏈會員", className: "bg-amber-100 text-amber-700 border-amber-200" },
    official_use: { label: "公務使用", className: "bg-slate-100 text-slate-700 border-slate-200" },
    franchise_diff: { label: "加盟價差", className: "bg-rose-100 text-rose-700 border-rose-200" },
    owner_provided: { label: "業主自帶", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    accommodation_voucher: { label: "住宿票卷", className: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    hotelnabe: { label: "hotelnabe", className: "bg-sky-100 text-sky-700 border-sky-200" },
    owlting: { label: "奧丁丁", className: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200" },
  };
  const base = sourceMap[source] || { label: source || "官網訂房", className: "bg-muted text-muted-foreground border-border" };
  const trimmed = (otaCode ?? "").toString().trim();
  if (source === "hotelnabe" && trimmed) {
    return { ...base, label: `${base.label} - ${trimmed.toLowerCase()}` };
  }
  if (source === "owlting" && trimmed) {
    return { ...base, label: `${base.label} - ${OWLTING_OTA_DISPLAY_NAMES[trimmed.toLowerCase()] ?? trimmed}` };
  }
  return base;
};

/** Extract HotelNabe inbound OTA channel code from order.hotelnabe_sync_state jsonb. */
export const getHotelnabeOtaCode = (order: { hotelnabe_sync_state?: any } | null | undefined): string | null => {
  const s = order?.hotelnabe_sync_state;
  if (!s || typeof s !== "object") return null;
  const v = (s as any).ota_code;
  if (v == null) return null;
  const str = String(v).trim();
  return str.length ? str : null;
};

/** Return the OTA/channel code to display for an order (hotelnabe sync state OR owlting ota_channel). */
export const getOrderOtaCode = (
  order: { order_source?: string | null; hotelnabe_sync_state?: any; ota_channel?: string | null } | null | undefined,
): string | null => {
  if (!order) return null;
  if (order.order_source === "hotelnabe") return getHotelnabeOtaCode(order);
  if (order.order_source === "owlting") {
    const v = (order.ota_channel ?? "").toString().trim();
    return v || null;
  }
  return null;
};

/** 訂單來源 code → 中文顯示名稱（供 Tooltip 使用） */
export const ORDER_SOURCE_DISPLAY_NAMES: Record<string, string> = {
  website: "官網訂房",
  manual: "現場訂房",
  line: "Line@ 官方帳號",
  agoda: "Agoda",
  booking: "Booking.com",
  trip: "Trip.com",
  travel_agency: "旅行社",
  kol: "KOL 互惠合作",
  points_starchain: "星鏈會員點數",
  official_use: "公務使用",
  franchise_diff: "加盟價差",
  owner_provided: "業主自帶",
  accommodation_voucher: "住宿票卷",
  hotelnabe: "旭海 HotelNabe (Channel Manager)",
  owlting: "奧丁丁 OwlNest (OTA 聚合)",
};

/** 旭海通路 OTA code → 顯示名稱 */
export const HOTELNABE_OTA_DISPLAY_NAMES: Record<string, string> = {
  booking: "Booking.com",
  agoda: "Agoda",
  expedia: "Expedia",
  trip: "Trip.com",
  ctrip: "攜程 Ctrip",
  airbnb: "Airbnb",
  hotels: "Hotels.com",
  klook: "Klook",
  kkday: "KKday",
  direct: "旭海直訂",
};

/** 奧丁丁通路 OTA code → 顯示名稱 */
export const OWLTING_OTA_DISPLAY_NAMES: Record<string, string> = {
  agoda: "Agoda",
  booking: "Booking.com",
  expedia: "Expedia",
  trip: "Trip.com",
  airbnb: "Airbnb",
  klook: "Klook",
  kkday: "KKday",
  owlting_direct: "奧丁丁官網",
};

export const getOrderSourceDisplayName = (source: string) =>
  ORDER_SOURCE_DISPLAY_NAMES[source] ?? source ?? "未知";

export const getHotelnabeOtaDisplayName = (code: string) => {
  const key = (code || "").trim().toLowerCase();
  return HOTELNABE_OTA_DISPLAY_NAMES[key] ?? code;
};


export const getOrderStatusLabel = (status: string) => {
  const statusMap: Record<string, string> = {
    hold: "保留中",
    pending: "待確認",
    confirmed: "已確認",
    checked_in: "已入住",
    checked_out: "已退房",
    cancelled: "已取消",
  };
  return statusMap[status] || status;
};

export const getPaymentMethodLabel = (method: string | null | undefined): string => {
  if (!method) return "";
  const map: Record<string, string> = {
    credit_card: "信用卡",
    credit_card_3ds: "信用卡",
    atm: "ATM 虛擬帳號",
    line_pay: "LINE Pay",
    bank_transfer: "轉帳匯款",
    cash: "現金",
    monthly: "月結",
  };
  return map[method] || method;
};

/**
 * Pick the most relevant payment method for an order:
 * balance > deposit > generic payment_method.
 */
export const getOrderPaymentMethod = (order: {
  payment_method?: string | null;
  deposit_payment_method?: string | null;
  balance_payment_method?: string | null;
}): string | null => {
  return (
    order.balance_payment_method ||
    order.deposit_payment_method ||
    order.payment_method ||
    null
  );
};

/**
 * 清掉旅安匯入的訂購人欄位中的 UNKNOWN 佔位符（副住客未填時旅安會自動補 "UNKNOWN UNKNOWN"）。
 * 僅用於顯示，不改 DB。
 */
export const cleanGuestNameDisplay = (name: string | null | undefined): string => {
  if (!name) return "";
  const cleaned = name
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !/^unknown(\s+unknown)*$/i.test(s))
    .join(", ");
  return cleaned || name;
};
