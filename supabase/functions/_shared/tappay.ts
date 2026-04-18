// Shared TapPay utilities for Edge Functions

export function getTapPayEndpoints() {
  const env = Deno.env.get("TAPPAY_ENV") === "sandbox" ? "sandbox" : "production";
  const base =
    env === "sandbox" ? "https://sandbox.tappaysdk.com" : "https://prod.tappaysdk.com";
  return {
    env,
    payByPrime: `${base}/tpc/payment/pay-by-prime`,
    refund: `${base}/tpc/transaction/refund`,
  };
}

export function normalizePhoneE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("09") && cleaned.length === 10) return "+886" + cleaned.substring(1);
  if (cleaned.startsWith("886")) return "+" + cleaned;
  return "+886" + cleaned;
}

export interface TapPayChargeArgs {
  partnerKey: string;
  merchantId: string;
  prime: string;
  amount: number;
  details: string;
  orderNumber: string;
  cardholder: { name: string; email: string; phoneNumber: string };
}

export interface TapPayChargeResult {
  status: number;
  msg?: string;
  rec_trade_id?: string;
  auth_code?: string;
  raw: any;
}

export async function chargeByPrime(args: TapPayChargeArgs): Promise<TapPayChargeResult> {
  const { payByPrime } = getTapPayEndpoints();
  const phoneE164 = normalizePhoneE164(args.cardholder.phoneNumber);

  const resp = await fetch(payByPrime, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": args.partnerKey },
    body: JSON.stringify({
      prime: args.prime,
      partner_key: args.partnerKey,
      merchant_id: args.merchantId,
      amount: args.amount,
      currency: "TWD",
      details: args.details,
      order_number: args.orderNumber.substring(0, 50),
      cardholder: {
        phone_number: phoneE164,
        name: args.cardholder.name,
        email: args.cardholder.email,
      },
      remember: false,
      three_domain_secure: false,
    }),
  });
  const result = await resp.json();
  return {
    status: result.status,
    msg: result.msg,
    rec_trade_id: result.rec_trade_id,
    auth_code: result.auth_code,
    raw: result,
  };
}

export async function refundTapPay(
  partnerKey: string,
  recTradeId: string,
  amount: number,
): Promise<boolean> {
  try {
    const { refund } = getTapPayEndpoints();
    const resp = await fetch(refund, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": partnerKey },
      body: JSON.stringify({ partner_key: partnerKey, rec_trade_id: recTradeId, amount }),
    });
    const result = await resp.json();
    console.error("[tappay] Refund result:", { status: result.status, msg: result.msg });
    return result.status === 0;
  } catch (e) {
    console.error("[tappay] Refund threw:", e);
    return false;
  }
}

export function mapTapPayErrorToUserMessage(status: number, msg?: string): {
  userMessage: string;
  suggestion: string;
} {
  let userMessage = msg || "付款失敗";
  let suggestion = "請檢查卡片資訊或聯繫發卡銀行";
  switch (status) {
    case 3:
      userMessage = "卡片資訊錯誤";
      suggestion = "請檢查卡號、有效期限和安全碼";
      break;
    case 10:
      userMessage = "授權失敗";
      suggestion = "卡片餘額不足或超過信用額度";
      break;
    case 924:
      userMessage = "3D 驗證失敗";
      break;
    case 925:
      userMessage = "交易被拒絕";
      suggestion = "請聯繫發卡銀行確認卡片狀態";
      break;
    case 10023:
      userMessage = "銀行端回覆錯誤";
      suggestion = "請稍後重試或更換卡片";
      break;
  }
  return { userMessage, suggestion };
}
