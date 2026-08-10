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
): Promise<{ success: boolean; status?: number; msg?: string }> {
  try {
    const { refund } = getTapPayEndpoints();
    const resp = await fetch(refund, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": partnerKey },
      body: JSON.stringify({ partner_key: partnerKey, rec_trade_id: recTradeId, amount }),
    });
    const result = await resp.json();
    console.error("[tappay] Refund result:", { status: result.status, msg: result.msg });
    return { success: result.status === 0, status: result.status, msg: result.msg };
  } catch (e) {
    console.error("[tappay] Refund threw:", e);
    return { success: false, msg: String(e) };
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

// ---------------------------------------------------------------------------
// Bind Card / Pay by Card Token (用於「結帳只綁卡、入住當天才扣款」流程)
// Docs: https://docs.tappaysdk.com/tutorial/zh/back.html#bind-card-api
// ---------------------------------------------------------------------------

export function getTapPayTokenEndpoints() {
  const env = Deno.env.get("TAPPAY_ENV") === "sandbox" ? "sandbox" : "production";
  const base = env === "sandbox" ? "https://sandbox.tappaysdk.com" : "https://prod.tappaysdk.com";
  return {
    bindCard: `${base}/tpc/card/bind`,
    payByToken: `${base}/tpc/payment/pay-by-token`,
  };
}

export interface BindCardResult {
  success: boolean;
  status: number;
  msg?: string;
  cardKey?: string;
  cardToken?: string;
  cardLastFour?: string | null;
  cardType?: string | null;
  cardExpiry?: string | null;
}

export async function bindCardByPrime(args: {
  partnerKey: string;
  merchantId: string;
  prime: string;
  cardholder: { name: string; email: string; phoneNumber: string };
}): Promise<BindCardResult> {
  const { bindCard } = getTapPayTokenEndpoints();
  const resp = await fetch(bindCard, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": args.partnerKey },
    body: JSON.stringify({
      prime: args.prime,
      partner_key: args.partnerKey,
      merchant_id: args.merchantId,
      currency: "TWD",
      cardholder: {
        phone_number: normalizePhoneE164(args.cardholder.phoneNumber),
        name: args.cardholder.name,
        email: args.cardholder.email,
      },
    }),
  });
  const result = await resp.json();
  const cardInfo = result.card_info ?? {};
  return {
    success: result.status === 0 && !!result.card_secret?.card_key && !!result.card_secret?.card_token,
    status: result.status,
    msg: result.msg,
    cardKey: result.card_secret?.card_key,
    cardToken: result.card_secret?.card_token,
    cardLastFour: cardInfo.last_four ?? null,
    cardType: cardInfo.type != null ? String(cardInfo.type) : null,
    cardExpiry: cardInfo.expiry_date ?? null,
  };
}

export async function payByCardToken(args: {
  partnerKey: string;
  merchantId: string;
  cardKey: string;
  cardToken: string;
  amount: number;
  details: string;
  orderNumber: string;
}): Promise<{ success: boolean; status: number; msg?: string; recTradeId?: string; authCode?: string }> {
  const { payByToken } = getTapPayTokenEndpoints();
  const resp = await fetch(payByToken, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": args.partnerKey },
    body: JSON.stringify({
      card_key: args.cardKey,
      card_token: args.cardToken,
      partner_key: args.partnerKey,
      merchant_id: args.merchantId,
      amount: args.amount,
      currency: "TWD",
      details: args.details.substring(0, 100),
      order_number: args.orderNumber.substring(0, 50),
      three_domain_secure: false,
    }),
  });
  const result = await resp.json();
  return {
    success: result.status === 0,
    status: result.status,
    msg: result.msg,
    recTradeId: result.rec_trade_id,
    authCode: result.auth_code,
  };
}

/** 查詢 TapPay 交易紀錄（供金流稽核核對真實金額／狀態） */
export async function queryTapPayRecord(args: {
  partnerKey: string;
  recTradeId: string;
}): Promise<{
  found: boolean;
  status: number | null;
  recordStatus: number | null;
  amount: number | null;
  refundedAmount: number | null;
  bankTransactionId: string | null;
  orderNumber: string | null;
  raw: any;
}> {
  const { env } = getTapPayEndpoints();
  const base = env === "sandbox" ? "https://sandbox.tappaysdk.com" : "https://prod.tappaysdk.com";
  const resp = await fetch(`${base}/tpc/transaction/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": args.partnerKey },
    body: JSON.stringify({
      partner_key: args.partnerKey,
      filters: { rec_trade_id: args.recTradeId },
      records_per_page: 1,
      page: 0,
    }),
  });
  const result = await resp.json();
  const rec = Array.isArray(result?.trade_records) ? result.trade_records[0] : null;
  return {
    found: !!rec,
    status: result?.status ?? null,
    recordStatus: rec?.record_status ?? null,
    amount: rec?.amount ?? null,
    refundedAmount: rec?.refunded_amount ?? null,
    bankTransactionId: rec?.bank_transaction_id ?? null,
    orderNumber: rec?.order_number ?? null,
    raw: result,
  };
}
