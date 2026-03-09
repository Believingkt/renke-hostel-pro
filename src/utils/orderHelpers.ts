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
    website: { label: "官網下單", className: "bg-blue-100 text-blue-700 border-blue-200" },
    manual: { label: "後台", className: "bg-purple-100 text-purple-700 border-purple-200" },
    agoda: { label: "Agoda", className: "bg-green-100 text-green-700 border-green-200" },
    booking: { label: "Booking", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
    trip: { label: "Trip", className: "bg-orange-100 text-orange-700 border-orange-200" },
  };
  return sourceMap[source] || { label: source || "官網下單", className: "bg-muted text-muted-foreground border-border" };
};

export const getOrderStatusLabel = (status: string) => {
  const statusMap: Record<string, string> = {
    pending: "待確認",
    confirmed: "已確認",
    checked_in: "已入住",
    checked_out: "已退房",
    cancelled: "已取消",
  };
  return statusMap[status] || status;
};
