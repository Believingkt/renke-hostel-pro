// 臨時工具：寄出「訂房確認・已完成付款」樣本信到固定信箱後即刪除。
import { renderDepositReceived, sendGroupBuyEmail, type GroupBuyEmailOrder } from "../_shared/groupBuyEmail.ts";

const TO = "sakithebest@gmail.com";

const sample: GroupBuyEmailOrder = {
  orderNumber: "SAMPLE99",
  guestName: "範例旅客",
  campaignTitle: "【範例】團購活動",
  accommodationName: "範例民宿",
  packageName: "包棟兩晚方案",
  checkInDate: "2026-10-01",
  checkOutDate: "2026-10-03",
  guestCount: 4,
  totalPrice: 24000,
  depositAmount: 8000,
  balanceAmount: 0,
  deadlineText: "2026/09/08 23:59",
  orderUrl: "https://booking.lakeze.com/group-buy/order",
  cancellationPolicy: "deposit",
  nights: 2,
  roomQuantity: 1,
  roomTypeName: "全棟",
  guestCompositionText: "成人 4",
  contactPhone: "0912-345-678",
  contactEmail: "sample@example.com",
  paidAmount: 24000,
  paymentMethodText: "信用卡（3D 驗證）",
  refundChannelText: "原信用卡退刷",
  venueAddress: "宜蘭縣範例鄉範例路 1 號",
  venuePhone: "03-000-0000",
  arrivalNotice: "入住時間 15:00 後，退房 11:00 前。",
  isCardOrder: true,
  fullPrepayment: true,
};

Deno.serve(async () => {
  const mail = renderDepositReceived(sample, {
    providerLabel: "信用卡（3D 驗證）",
    paidThisTime: 24000,
    fullPayment: true,
  });
  const r = await sendGroupBuyEmail(TO, { subject: `[測試樣本] ${mail.subject}`, html: mail.html });
  return new Response(JSON.stringify({ to: TO, subject: mail.subject, ...r }), {
    headers: { "Content-Type": "application/json" },
  });
});
