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
  const unpaidStatuses = ['unpaid'];
  if (unpaidStatuses.includes(paymentStatus) && isPaymentLinkExpired(paymentLinkCreatedAt)) {
    return 'overdue';
  }
  return paymentStatus;
};

export const getPaymentStatusConfig = (status: string) => {
  const statusMap: Record<string, { label: string; className: string }> = {
    unpaid: { label: "未付款", className: "bg-red-100 text-red-700 border-red-200" },
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

export const getOrderSourceConfig = (source: string) => {
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
  };
  return sourceMap[source] || { label: source || "官網訂房", className: "bg-muted text-muted-foreground border-border" };
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
