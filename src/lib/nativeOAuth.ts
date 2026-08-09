// Native (Capacitor) OAuth support.
//
// Web flows are unchanged. Inside the iOS/Android WebView, an external browser
// cannot hand the Supabase session back to the app, so we:
//   1. open the provider authorize URL with @capacitor/browser
//   2. make the final redirect land on the custom scheme `lakeze://auth-callback`
//   3. catch it with @capacitor/app `appUrlOpen`, establish the session, close
//      the in-app browser.
//
// Facebook / LINE keep their https callback pages (their consoles only allow
// https redirect URIs); those pages then forward to `lakeze://auth-callback`
// with the tokens in the URL fragment. The return target is carried in the
// OAuth `state` parameter (see oauthCallbackHandler.decodeReturnUrlFromState).

import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import type { PluginListenerHandle } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const NATIVE_AUTH_CALLBACK = "lakeze://auth-callback";

type NativeAuthProvider = "facebook" | "line" | "google" | "apple";

let nativeAuthFlight: NativeAuthProvider | null = null;
let browserFinishedHandle: PluginListenerHandle | null = null;

function clearNativeAuthFlight(reason: "callback_received" | "browser_closed" | "launch_failed"): void {
  console.log("[nativeOAuth] single-flight cleared", { provider: nativeAuthFlight, reason });
  nativeAuthFlight = null;
  const handle = browserFinishedHandle;
  browserFinishedHandle = null;
  if (handle) void handle.remove().catch(() => {});
}

export function isNativeOAuth(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** base64url-encode the native callback so it can ride inside `state`. */
export function encodeNativeReturnState(prefix: string, suffix?: string): string {
  const b64 = btoa(unescape(encodeURIComponent(NATIVE_AUTH_CALLBACK)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return suffix ? `${prefix}.${b64}.${suffix}` : `${prefix}.${b64}`;
}

export async function openNativeAuthBrowser(
  url: string,
  provider: NativeAuthProvider,
  onBrowserFinished?: () => void,
): Promise<boolean> {
  // React loading state updates asynchronously, so it cannot prevent two launch
  // events in the same render frame. This module-level lock is synchronous and
  // remains held for the complete browser + callback exchange lifecycle.
  if (nativeAuthFlight) {
    console.log("[nativeOAuth] duplicate launch blocked", {
      requestedProvider: provider,
      activeProvider: nativeAuthFlight,
    });
    return false;
  }

  nativeAuthFlight = provider;
  try {
    browserFinishedHandle = await Browser.addListener("browserFinished", () => {
      clearNativeAuthFlight("browser_closed");
      onBrowserFinished?.();
    });
    await Browser.open({ url, presentationStyle: "popover" });
    return true;
  } catch (error) {
    clearNativeAuthFlight("launch_failed");
    throw error;
  }
}

export async function closeNativeAuthBrowser(): Promise<void> {
  try {
    await Browser.close();
  } catch {
    /* already closed */
  }
}

type Params = { access_token?: string; refresh_token?: string; code?: string; error?: string; error_description?: string };

function parseCallbackParams(rawUrl: string): Params {
  const out: Params = {};
  const take = (qs: string) => {
    const sp = new URLSearchParams(qs);
    for (const k of ["access_token", "refresh_token", "code", "error", "error_description"] as const) {
      const v = sp.get(k);
      if (v && !out[k]) out[k] = v;
    }
  };
  const hashIdx = rawUrl.indexOf("#");
  const queryIdx = rawUrl.indexOf("?");
  if (hashIdx >= 0) take(rawUrl.slice(hashIdx + 1));
  if (queryIdx >= 0) take(rawUrl.slice(queryIdx + 1, hashIdx >= 0 ? hashIdx : undefined));
  return out;
}

export type NativeAuthResult = { ok: boolean; error?: string };

/**
 * Registers the deep-link listener. Safe to call on web (no-op).
 * Returns an unsubscribe function.
 */
export function initNativeAuthListener(
  onResult?: (result: NativeAuthResult) => void,
): () => void {
  if (!isNativeOAuth()) return () => {};

  let disposed = false;
  const handlePromise = CapApp.addListener("appUrlOpen", async ({ url }) => {
    if (!url || !url.toLowerCase().startsWith("lakeze://auth-callback")) return;
    console.log("[nativeOAuth] appUrlOpen", url.split("#")[0]);

    // Receiving the callback is the successful end of the browser flight. Stop
    // the browser before session hydration so no stale provider consent page can
    // remain visible or accept another tap while setSession is running.
    clearNativeAuthFlight("callback_received");
    await closeNativeAuthBrowser();

    const p = parseCallbackParams(url);
    // Diagnostic: which parameter keys arrived (never the values/tokens).
    console.log(
      "[nativeOAuth] callback param keys:",
      (Object.keys(p) as (keyof Params)[]).filter((k) => !!p[k]).join(",") || "(none)",
    );
    try {
      if (p.error) throw new Error(p.error_description || p.error);

      if (p.access_token && p.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: p.access_token,
          refresh_token: p.refresh_token,
        });
        if (error) throw error;
      } else if (p.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(p.code);
        if (error) throw error;
      } else {
        throw new Error("回呼網址未包含登入資訊");
      }

      const { data } = await supabase.auth.getSession();
      if (!data?.session?.user) throw new Error("Session 建立失敗，請重試");

      if (!disposed) onResult?.({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[nativeOAuth] callback failed", msg);
      if (!disposed) onResult?.({ ok: false, error: msg });
    }
  });

  return () => {
    disposed = true;
    void handlePromise.then((h) => h.remove()).catch(() => {});
  };
}

/**
 * Supabase-managed providers (Google / Apple) inside the native app.
 */
export async function nativeSupabaseOAuth(provider: "google" | "apple"): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("未取得授權網址");
  await openNativeAuthBrowser(data.url, provider);
}
