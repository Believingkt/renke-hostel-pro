// Native (Capacitor) 3DS payment handoff.
//
// Web flow is unchanged. Inside the iOS/Android WebView we cannot use
// `window.location.origin` (capacitor://localhost) as TapPay's
// `frontend_redirect_url` — TapPay rejects non-https URLs with
// "Invalid arguments : result_url > frontend_redirect_url".
//
// So, mirroring the OAuth handoff that already works:
//   1. frontend_redirect_url is a fixed https page on booking.lakeze.com,
//      flagged with `?native=1` in the URL (NOT sessionStorage — the in-app
//      browser is an isolated storage context).
//   2. That https page detects the flag and immediately forwards the payment
//      result to `lakeze://payment-result?...`.
//   3. The app catches it with `appUrlOpen`, closes the in-app browser and
//      finishes the order inside its own WebView (where the pending order
//      payload lives).

import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

export const NATIVE_PAYMENT_CALLBACK = "lakeze://payment-result";

/** Fixed https 3DS return page used as TapPay frontend_redirect_url in the app. */
export const NATIVE_3DS_RETURN_URL =
  "https://booking.lakeze.com/payment-result?source=booking-paid&native=1";

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function openNativePaymentBrowser(url: string): Promise<void> {
  await Browser.open({ url, presentationStyle: "popover" });
}

export async function closeNativePaymentBrowser(): Promise<void> {
  try {
    await Browser.close();
  } catch {
    /* already closed */
  }
}

export type NativePaymentResult = {
  recTradeId?: string;
  orderNumber?: string;
  status?: string;
  success: boolean;
  error?: string;
};

function parseParams(rawUrl: string): URLSearchParams {
  const qIdx = rawUrl.indexOf("?");
  const hIdx = rawUrl.indexOf("#");
  const parts: string[] = [];
  if (qIdx >= 0) parts.push(rawUrl.slice(qIdx + 1, hIdx >= 0 ? hIdx : undefined));
  if (hIdx >= 0) parts.push(rawUrl.slice(hIdx + 1));
  return new URLSearchParams(parts.join("&"));
}

/**
 * Register the `lakeze://payment-result` deep-link listener.
 * No-op on web. Returns an unsubscribe function.
 */
export function initNativePaymentListener(
  onResult: (result: NativePaymentResult) => void,
): () => void {
  if (!isNativeApp()) return () => {};

  let disposed = false;
  const handlePromise = CapApp.addListener("appUrlOpen", async ({ url }) => {
    if (!url || !url.toLowerCase().startsWith("lakeze://payment-result")) return;
    console.log("[nativePayment] appUrlOpen", url.split("?")[0]);
    await closeNativePaymentBrowser();

    const sp = parseParams(url);
    const recTradeId = sp.get("rec_trade_id") || undefined;
    const status = sp.get("status") || undefined;
    const error = sp.get("error") || undefined;
    if (disposed) return;
    onResult({
      recTradeId,
      orderNumber: sp.get("order_number") || undefined,
      status,
      error: error || undefined,
      success: !error && !!recTradeId && (status ?? "success") !== "failed",
    });
  });

  return () => {
    disposed = true;
    void handlePromise.then((h) => h.remove()).catch(() => {});
  };
}

/**
 * Called from the https 3DS return page when it was opened for a native app:
 * hand the TapPay result back to the app via the custom scheme.
 */
export function handoffPaymentResultToApp(params: Record<string, string | undefined>): void {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  window.location.href = `${NATIVE_PAYMENT_CALLBACK}?${sp.toString()}`;
}
