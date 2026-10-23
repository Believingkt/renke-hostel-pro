// PAYUNi 合作商店規則（前端副本）：與 supabase/functions/_shared/payuniMerchant.ts 相同，
// 由 src/test/payuni-merchant-rules-parity.test.ts 以同一組案例比對兩邊結果一致；修改時兩份要一起改。

export const PAYUNI_DEFAULT_MCC = "93"; // 代碼表 #/9/69：93 民宿／94 飯店
export const PAYUNI_BOOKING_BASE = "https://booking.lakeze.com";
export const PAYUNI_CLOSE_APPLY_SWITCH = "SPB2C,SPB2CFrz,SPC2C,SPC2CFrz,HOME";

export const PAYUNI_PAYMENT_TOOL_KEYS = [
  "CREDIT", "Red", "UnionPay", "Inst3", "Inst6", "Inst9", "Inst12", "Inst18", "Inst24", "Inst30",
  "ForeignCard", "ApplePay", "GooglePay", "SamsungPay", "CVS", "ATM", "ICASH", "AFTEE", "JKoPay",
  "SPB2C", "SPB2CFrz", "SPC2C", "SPC2CFrz", "HOME",
] as const;

export const PAYUNI_MER_STATUS_LABELS: Record<number, string> = {
  1: "啟用", 2: "關閉", 8: "拒絕", 9: "審核中", 91: "待補資料", 92: "審核失敗", 99: "停用",
};

export const PAYUNI_MEMBER_STATUS_LABELS: Record<number, string> = {
  1: "啟用", 5: "待補資料", 8: "拒絕", 9: "待審核", 92: "審核失敗", 99: "關閉／停權",
};

export const PAYUNI_MCC_INVALID = "MCC 格式不正確";
export const PAYUNI_UBN_MASKED = "請重新輸入完整身分證字號";

export const PAYUNI_SETTING_KEYS = ["ThreeDCREDIT", "ThreeDForeignCard", "ThreeDUnionPay", "MerClose", "ATMSet"] as const;
export const PAYUNI_BACK_SETTING_KEYS = [
  "BackSetCREDIT", "BackSetATM", "BackSetCVS", "BackSetCreditToken", "BackSetUnCreditRefund",
  "BackSetShipping", "BackSetApplePay", "BackSetGooglePay", "BackSetLinePay", "BackSetIframe",
] as const;

/**
 * 商店未收到代理商 Notify「BackSetting」時的預設值＝代理商後台「合作商店初始值」
 * （非信用卡退款轉匯、ATM、iframe 皆啟用）。PAYUNi 只在設定「變更」時送 BackSetting，
 * 建店時只送 MerPayment／MerStatus，所以新建商店的 payuni_settings 通常沒有 backSetting。
 */
export const PAYUNI_DEFAULT_BACK_SETTING = { BackSetUnCreditRefund: "1", BackSetATM: "1", BackSetIframe: "1" } as const;

/** 讀 backSetting 某項：沒有值時採 PAYUNI_DEFAULT_BACK_SETTING */
export function payuniBackSettingValue(back: Record<string, unknown> | null | undefined, key: keyof typeof PAYUNI_DEFAULT_BACK_SETTING): string {
  const v = back?.[key];
  return v == null || String(v).trim() === "" ? PAYUNI_DEFAULT_BACK_SETTING[key] : String(v).trim();
}

/** ATM 退款轉匯（BackSetUnCreditRefund）：只有明確為 "2" 才視為關閉 */
export const isPayuniAtmRefundEnabled = (backSetUnCreditRefund: unknown) =>
  payuniBackSettingValue({ BackSetUnCreditRefund: backSetUnCreditRefund }, "BackSetUnCreditRefund") !== "2";

export interface PayuniBindForm {
  legal_name: string;
  ubn: string;
  member_email: string;
  mbc_name?: string;
  mbc_tel?: string;
  mbc_mail?: string;
  mc_name?: string;
  mcid?: string;
  contact_name: string;
  contact_tel?: string;
  contact_mobile?: string;
  mer_email: string;
  mer_name: string;
  mer_eng_name: string;
  mer_addr: string;
  mer_addr_post: string;
  mer_tel?: string;
  mer_desc: string;
  mer_mcc: string;
  goods_rate: string;
  payment: string[] | string;
  deliver_time: string | number;
  escrow_type: string | number;
  mer_unit_price: string | number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UBN_RE = /^\d{8}$/;
const NATIONAL_ID_RE = /^[A-Z][12]\d{8}$/;
const TEL_RE = /^0\d{1,3}-\d{5,8}(#\d{1,6})?$/;
const MOBILE_RE = /^09\d{8}$/;
const ENG_NAME_RE = /^[A-Za-z0-9 ~!@#$%^&*()_\-+={[}\]\\:;"<,>.?/']+$/;

const str = (v: unknown) => (v == null ? "" : String(v).trim());
const len = (s: string) => [...s].length;

export function normalizePayment(p: unknown): string[] {
  const list = Array.isArray(p) ? p : str(p).split(",");
  return [...new Set(list.map((x) => str(x)).filter(Boolean))];
}

export function isValidGoodsRate(v: unknown): boolean {
  const parts = str(v).split(",");
  if (parts.length !== 4 || !parts.every((x) => /^\d{1,3}$/.test(x.trim()))) return false;
  return parts.reduce((s, x) => s + Number(x), 0) === 100;
}

/** 回傳欄位錯誤（key → 中文說明）；空物件代表通過 */
export function validateBindForm(raw: Partial<PayuniBindForm> | null | undefined): Record<string, string> {
  const f = raw ?? {};
  const e: Record<string, string> = {};
  const need = (k: keyof PayuniBindForm, label: string) => { if (!str(f[k])) e[k] = `${label}必填`; };

  need("legal_name", "登記名稱");
  const ubn = str(f.ubn);
  if (ubn.includes("*")) e.ubn = PAYUNI_UBN_MASKED;
  else if (!UBN_RE.test(ubn) && !NATIONAL_ID_RE.test(ubn)) e.ubn = "統編須為 8 碼數字，或 10 碼身分證字號";
  if (!EMAIL_RE.test(str(f.member_email))) e.member_email = "會員 Email 格式不正確";
  if (str(f.mbc_mail) && !EMAIL_RE.test(str(f.mbc_mail))) e.mbc_mail = "Email 格式不正確";
  if (str(f.mbc_tel) && !TEL_RE.test(str(f.mbc_tel)) && !MOBILE_RE.test(str(f.mbc_tel))) e.mbc_tel = "電話格式不正確";
  need("contact_name", "聯絡人");
  const tel = str(f.contact_tel), mobile = str(f.contact_mobile);
  if (!tel && !mobile) e.contact_tel = "聯絡電話與手機至少填一個";
  if (tel && !TEL_RE.test(tel)) e.contact_tel = "聯絡電話格式如 02-9888888#123";
  if (mobile && !MOBILE_RE.test(mobile)) e.contact_mobile = "手機格式如 0912345678";
  if (!EMAIL_RE.test(str(f.mer_email))) e.mer_email = "商店 Email 格式不正確";
  const merName = str(f.mer_name);
  if (!merName) e.mer_name = "商店名稱必填";
  else if (len(merName) > 20) e.mer_name = "商店名稱最多 20 字";
  const eng = str(f.mer_eng_name);
  if (!eng) e.mer_eng_name = "英文名稱必填";
  else if (eng.length > 50) e.mer_eng_name = "英文名稱最多 50 字";
  else if (!ENG_NAME_RE.test(eng)) e.mer_eng_name = "英文名稱只能包含英數、空白與半形符號";
  need("mer_addr", "商店地址");
  if (!/^\d{3}$/.test(str(f.mer_addr_post))) e.mer_addr_post = "郵遞區號須為 3 碼數字";
  if (str(f.mer_tel) && !TEL_RE.test(str(f.mer_tel))) e.mer_tel = "商店電話格式如 02-9888888";
  const desc = str(f.mer_desc);
  if (!desc) e.mer_desc = "商店簡介必填";
  else if (len(desc) > 500) e.mer_desc = "商店簡介最多 500 字";
  const mcc = str(f.mer_mcc);
  // PAYUNi MerMCC：int、最多 3 碼，不可為 0
  if (!/^\d{1,3}$/.test(mcc) || Number(mcc) === 0) e.mer_mcc = PAYUNI_MCC_INVALID;
  if (!isValidGoodsRate(f.goods_rate)) e.goods_rate = "商品比例須為 4 個數字，總和 100";
  const pay = normalizePayment(f.payment);
  if (pay.length === 0) e.payment = "至少選一種支付工具";
  else if (pay.some((p) => !(PAYUNI_PAYMENT_TOOL_KEYS as readonly string[]).includes(p))) e.payment = "含不支援的支付工具";
  if (!/^\d{1,3}$/.test(str(f.deliver_time))) e.deliver_time = "出貨天數須為整數";
  if (!/^[01]$/.test(str(f.escrow_type))) e.escrow_type = "履約保證須為 0 或 1";
  if (!/^[1-9]\d{0,7}$/.test(str(f.mer_unit_price))) e.mer_unit_price = "平均客單價須為正整數";
  return e;
}

export function buildMerUrl(shortUrlAlias: string | null | undefined): string {
  const alias = str(shortUrlAlias);
  return alias ? `${PAYUNI_BOOKING_BASE}/${alias}` : PAYUNI_BOOKING_BASE;
}

export function defaultMerDesc(description: string | null | undefined): string {
  return "民宿住宿服務；" + [...str(description).replace(/[\r\n]+/g, " ")].slice(0, 400).join("");
}

/** MerID = AgentID + 4 位流水；流水 = 目前同前綴最大值 + 1 */
export function nextMerId(agentId: string, existing: Array<string | null | undefined>): string {
  const re = new RegExp(`^${agentId}(\\d{4})$`);
  let max = 0;
  for (const id of existing) {
    const m = re.exec(str(id));
    if (m) max = Math.max(max, Number(m[1]));
  }
  if (max >= 9999) throw new Error("MerID 流水已用盡");
  return `${agentId}${String(max + 1).padStart(4, "0")}`;
}

/** bind_merchant EncryptInfo（含 MCID；MCID 只用於送出） */
export function buildBindPayload(f: PayuniBindForm, merId: string, merUrl: string): Record<string, string | number> {
  const p: Record<string, string | number> = {
    Name: str(f.legal_name),
    UBN: str(f.ubn),
    Email: str(f.member_email),
  };
  const opt: Array<[string, unknown]> = [
    ["MBCName", f.mbc_name], ["MBCTel", f.mbc_tel], ["MBCMail", f.mbc_mail], ["MCName", f.mc_name], ["MCID", f.mcid],
  ];
  for (const [k, v] of opt) if (str(v)) p[k] = str(v);
  p.ContactName = str(f.contact_name);
  if (str(f.contact_tel)) p.ContactTel = str(f.contact_tel);
  if (str(f.contact_mobile)) p.ContactMobile = str(f.contact_mobile);
  Object.assign(p, {
    MerID: merId,
    MerEmail: str(f.mer_email),
    MerName: str(f.mer_name),
    MerEngName: str(f.mer_eng_name),
    MerURL: merUrl,
    MerAddr: str(f.mer_addr),
    MerAddrPost: str(f.mer_addr_post),
  });
  if (str(f.mer_tel)) p.MerTel = str(f.mer_tel);
  Object.assign(p, {
    MerDesc: str(f.mer_desc),
    MerType: 1,
    MerMCC: Number(str(f.mer_mcc)),
    GoodsRate: str(f.goods_rate).split(",").map((x) => x.trim()).join(","),
    Payment: normalizePayment(f.payment).join(","),
    DeliverTime: Number(str(f.deliver_time)),
    EscrowType: Number(str(f.escrow_type)),
    MerUnitPrice: Number(str(f.mer_unit_price)),
    SellType: 1,
    CloseApplySwitch: PAYUNI_CLOSE_APPLY_SWITCH,
  });
  return p;
}

/** 落庫用：身分證字號遮罩為「前 3 碼 + ***** + 後 2 碼」；8 碼統編原樣 */
export function maskUbnForStorage(ubn: unknown): string {
  const s = str(ubn);
  return NATIONAL_ID_RE.test(s) ? `${s.slice(0, 3)}*****${s.slice(-2)}` : s;
}

/** 商店非啟用且目前用 payuni 收款 → 需自動切回 none（Notify 與手動查詢共用） */
export function shouldAutoDisablePayuni(nextStatus: number | null | undefined, provider: string | null | undefined): boolean {
  return nextStatus !== 1 && provider === "payuni";
}

export function snapshotWithoutMcid(payload: Record<string, string | number>): Record<string, string | number> {
  const { MCID: _drop, ...rest } = payload;
  return rest;
}

const toInt = (v: unknown): number | null => {
  const s = str(v);
  return /^-?\d+$/.test(s) ? Number(s) : null;
};

/** 從 PAYUNi 回傳中取出有帶的支付工具鍵 → { 鍵: 整數 } */
export function extractPaymentTools(data: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of PAYUNI_PAYMENT_TOOL_KEYS) {
    const n = data ? toInt(data[k]) : null;
    if (n !== null) out[k] = n;
  }
  return out;
}

export function pickKeys(data: Record<string, unknown>, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) if (data[k] != null && str(data[k]) !== "") out[k] = str(data[k]);
  return out;
}

export function parseStatus(v: unknown): number | null {
  return toInt(v);
}

export function merStatusLabel(status: number | null | undefined): string {
  if (status == null) return "未建店";
  return PAYUNI_MER_STATUS_LABELS[status] ?? `未知（${status}）`;
}

export function memberStatusLabel(status: number | null | undefined): string {
  if (status == null) return "—";
  return PAYUNI_MEMBER_STATUS_LABELS[status] ?? `未知（${status}）`;
}

/** 切到 payuni 的前置條件：商店啟用，且信用卡或 ATM 已開通 */
export function canSwitchToPayuni(
  merStatus: number | null | undefined,
  tools: Record<string, unknown> | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (merStatus !== 1) return { ok: false, reason: `商店狀態為「${merStatusLabel(merStatus)}」，需為「啟用」才能切換` };
  const t = tools ?? {};
  if (Number(t.CREDIT) !== 1 && Number(t.ATM) !== 1) return { ok: false, reason: "信用卡（CREDIT）或 ATM 需至少一項已開通（狀態 1）" };
  return { ok: true };
}

/** BackSetting 中需通知總部的項目（值為 2） */
export function backSettingAlertKeys(back: Record<string, string>): string[] {
  return ["BackSetIframe", "BackSetATM", "BackSetUnCreditRefund"].filter((k) => back[k] === "2");
}

export function isBindable(merId: string | null | undefined, merStatus: number | null | undefined): boolean {
  return !str(merId) || merStatus === 92;
}
