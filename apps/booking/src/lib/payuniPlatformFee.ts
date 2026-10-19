import { supabase } from "@lakeze/shared/integrations/supabase/client";

export const FEE_FN = "payuni-platform-fee-run";
export const BATCH_STATUS: Record<string, string> = {
  draft: "草稿", confirmed: "已確認", submitting: "送出中", submitted: "已送出", settled: "已撥款", partial_failed: "部分失敗", cancelled: "已取消",
};
export const ITEM_STATUS: Record<string, string> = {
  pending: "待送出", sent: "已送出", failed: "失敗", funded: "已撥款", receivable: "轉應收", cancelled: "已取消",
};
export const UNKNOWN_SEND = new Set(["TIMEOUT", "NETWORK_ERROR", "INVALID_JSON", "HASH_MISMATCH", "DECRYPT_FAILED", "SENDING"]);
export const FEE_NOTICE = "平台費＝人客多佣金（依業主月結算法，只計 PAYUNi 收款訂單），每月由總部確認後以 PAYUNi 多功能收付扣款；PAYUNi 1% 服務費由人客多吸收。";

export interface FeeBatch { id: string; period: string; status: string; confirmed_at: string | null; submitted_at: string | null; created_at: string }
export interface FeeOrder {
  order_id: string; order_number: string; check_in_date: string; check_out_date: string;
  revenue: number; base: number; commission: number; premium_share: number; fee: number; exempt: boolean; payuni_paid: number; mixed_payment: boolean;
}
export interface FeeItem {
  id: string; batch_id: string; accommodation_id: string; mer_id: string; amount: number; bal_type: number; fee_type: number; trade_no: string;
  status: string; api_status: string | null; api_message: string | null; fund_date: string | null; payuni_fee: number | null;
  detail: {
    accommodation_name?: string | null; orders?: FeeOrder[]; refunds?: Array<{ order_number: string | null; amount: number; at: string }>;
    ragic?: { amount: number; diff: number; has_setting: boolean }; prior_unpaid?: Array<{ period: string; amount: number; status: string }>;
    adjustments?: Array<{ from: number; to: number; reason: string; by: string; at: string }>;
    correction?: { reason: string; created_by: string; confirmed_at?: string; confirmed_by?: string };
    non_payuni_orders?: number; month_fee_all_orders?: number;
  };
}

// 兩張表尚未在產生的型別內
export const feeTable = (t: "payuni_platform_fee_batches" | "payuni_platform_fee_items") => (supabase as any).from(t);

export async function callFee(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(FEE_FN, { body });
  if (error || !data?.ok) throw new Error(data?.error ?? "平台費處理失敗");
  return data;
}

export const ntd = (n: number | null | undefined) => (n == null ? "—" : `NT$ ${Math.round(Number(n)).toLocaleString()}`);
export const itemName = (i: FeeItem) => i.detail.accommodation_name ?? i.accommodation_id;
export const signed = (i: FeeItem) => (i.bal_type === 2 ? -i.amount : i.amount);

const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** 每館每月金額 CSV（財務開票用） */
export function feeCsv(period: string, items: FeeItem[]): string {
  const head = ["期間", "館別", "商店代號", "類型", "訂單數", "混合付款", "平台費", "Ragic 算法", "差額", "狀態", "撥款日", "PAYUNi 服務費", "TradeNo"];
  const rows = items.map((i) => [
    period, itemName(i), i.mer_id, i.bal_type === 2 ? "負向修正" : "扣款", i.detail.orders?.length ?? 0,
    i.detail.orders?.filter((o) => o.mixed_payment).length ?? 0, signed(i), i.bal_type === 1 ? i.detail.ragic?.amount ?? "" : "",
    i.bal_type === 1 ? i.amount - (i.detail.ragic?.amount ?? 0) : "", ITEM_STATUS[i.status] ?? i.status, i.fund_date ?? "", i.payuni_fee ?? "", i.trade_no,
  ]);
  return "\uFEFF" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
