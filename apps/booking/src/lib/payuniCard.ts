// PAYUNi UNi Embed（信用卡免跳轉）前端工具：SDK 一律從 PAYUNi 官方網址動態載入，不放自有主機
import { supabase } from "@lakeze/shared/integrations/supabase/client";

export const PAYUNI_SDK_URL = "https://vendor.payuni.com.tw/sdk/uni-payment.js";
export const PAYUNI_TOKEN_REFRESH_MS = 9 * 60 * 1000;
export const PAYUNI_LOAD_FAIL_MESSAGE = "付款元件載入失敗，請重新整理";

export interface PayuniSession {
  onUpdate: (cb: (u: { status?: Record<string, boolean> }) => void) => void;
  start: () => Promise<unknown>;
  getTradeResult: (opts?: Record<string, unknown>) => Promise<unknown>;
}
declare global {
  interface Window { UniPayment?: { createSession: (token: string, opts: Record<string, unknown>) => PayuniSession } }
}

let sdkPromise: Promise<void> | null = null;
export function loadPayuniSdk(): Promise<void> {
  if (window.UniPayment) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PAYUNI_SDK_URL;
      s.async = true;
      s.onload = () => (window.UniPayment ? resolve() : reject(new Error("SDK_MISSING")));
      s.onerror = () => { sdkPromise = null; reject(new Error("SDK_LOAD_FAILED")); };
      document.head.appendChild(s);
    });
  }
  return sdkPromise;
}

/** SDK 錯誤碼：1006／OBJ01003 = Token 過期需重取；1007 網域不符、1008 iframe 逾時 = 載入失敗 */
export function classifySdkError(e: unknown): "token_expired" | "load_failed" | "other" {
  const s = JSON.stringify(e ?? "") + String((e as any)?.message ?? "");
  if (/1006|OBJ01003/.test(s)) return "token_expired";
  if (/1007|1008/.test(s)) return "load_failed";
  return "other";
}

export interface EmbedToken { sdk_token: string; env: "S" | "P"; mer_trade_no: string; amount: number; expires_at: string }
export type ChargeResult = { ok: true; redirect_url?: string; paid?: boolean; pending?: boolean } | { ok: false; code?: string; message?: string };

async function invoke<T>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error || j?.message) msg = j.error ?? j.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data as T;
}
export const getEmbedToken = (orderNumber: string, purpose: "booking" | "supplement") =>
  invoke<EmbedToken>("payuni-embed-token", { order_number: orderNumber, purpose });
export const chargeCard = (merTradeNo: string) => invoke<ChargeResult>("payuni-card-charge", { mer_trade_no: merTradeNo });
