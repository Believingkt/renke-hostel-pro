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
export type NativeOAuthLaunchSource = "button" | "resume" | "visibility" | "retry" | "unknown";

type NativeAuthFlight = {
  provider: NativeAuthProvider;
  launchedAt: number;
  source: NativeOAuthLaunchSource;
};

const NATIVE_AUTH_LOCK_MS = 120_000;
const NATIVE_AUTH_LOCK_KEY = "native_oauth_launch_lock";
let nativeAuthFlight: NativeAuthFlight | null = null;
let browserFinishedHandle: PluginListenerHandle | null = null;

function detachBrowserFinishedListener(): void {
  const handle = browserFinishedHandle;
  browserFinishedHandle = null;
  if (handle) void handle.remove().catch(() => {});
}

function readPersistedFlight(): NativeAuthFlight | null {
  try {
    const raw = localStorage.getItem(NATIVE_AUTH_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NativeAuthFlight>;
    if (
      typeof parsed.provider !== "string" ||
      typeof parsed.launchedAt !== "number" ||
      typeof parsed.source !== "string"
    ) return null;
    return parsed as NativeAuthFlight;
  } catch {
    return null;
  }
}

function persistFlight(flight: NativeAuthFlight | null): void {
  try {
    if (flight) localStorage.setItem(NATIVE_AUTH_LOCK_KEY, JSON.stringify(flight));
    else localStorage.removeItem(NATIVE_AUTH_LOCK_KEY);
  } catch {
    /* localStorage can be unavailable in restricted WebViews */
  }
}

function activeFlight(): NativeAuthFlight | null {
  const flight = nativeAuthFlight ?? readPersistedFlight();
  if (!flight) return null;
  if (Date.now() - flight.launchedAt >= NATIVE_AUTH_LOCK_MS) {
    console.log("[oauth-launch] expired lock cleared", { provider: flight.provider, source: flight.source });
    nativeAuthFlight = null;
    persistFlight(null);
    return null;
  }
  nativeAuthFlight = flight;
  return flight;
}

function clearNativeAuthFlight(reason: "callback_received" | "browser_closed" | "launch_failed"): void {
  const flight = nativeAuthFlight ?? readPersistedFlight();
  console.log("[nativeOAuth] single-flight cleared", { provider: flight?.provider ?? null, source: flight?.source ?? null, reason });
  nativeAuthFlight = null;
  persistFlight(null);
  detachBrowserFinishedListener();
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
  source: NativeOAuthLaunchSource,
  onBrowserFinished?: () => void,
): Promise<boolean> {
  console.log(`[oauth-launch] source=${source}`, { provider, action: "attempt" });
  const existingFlight = activeFlight();
  if (existingFlight) {
    console.log(`[oauth-launch] source=${source}`, {
      action: "blocked",
      requestedProvider: provider,
      activeProvider: existingFlight.provider,
      activeSource: existingFlight.source,
      ageMs: Date.now() - existingFlight.launchedAt,
    });
    return false;
  }

  nativeAuthFlight = { provider, launchedAt: Date.now(), source };
  persistFlight(nativeAuthFlight);
  try {
    browserFinishedHandle = await Browser.addListener("browserFinished", () => {
      clearNativeAuthFlight("browser_closed");
      onBrowserFinished?.();
    });
    await Browser.open({ url, presentationStyle: "popover" });
    console.log(`[oauth-launch] source=${source}`, { provider, action: "opened" });
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

    // Keep the launch lock through the complete callback/session hydration.
    // Remove the browserFinished listener first so Browser.close() cannot clear
    // the lock while setSession is still pending.
    detachBrowserFinishedListener();
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
    } finally {
      clearNativeAuthFlight("callback_received");
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
export async function nativeSupabaseOAuth(
  provider: "google" | "apple",
  source: NativeOAuthLaunchSource = "button",
): Promise<boolean> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("未取得授權網址");
  return openNativeAuthBrowser(data.url, provider, source);
}
