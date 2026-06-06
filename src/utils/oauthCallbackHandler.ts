// Shared OAuth callback handler for Facebook / LINE.
// Implements the "safety-first" pattern:
//   1. Pre-check session — if already signed in, just navigate forward.
//   2. useRef guard on caller side prevents double exchange (single-use codes).
//   3. 8s timeout fallback — re-check session before failing.
//   4. After setSession, re-getSession to confirm before navigating.
//   5. Verbose console.log at every key step.
//
// Cross-origin return URL: callers (e.g. OrderPayment on an accommodation's
// custom domain) encode the return URL into the OAuth `state` parameter
// because sessionStorage is per-origin and the callback always lands on
// booking.lakeze.com. Use `decodeReturnUrlFromState(state)` to recover it.

import { supabase } from "@/integrations/supabase/client";

export interface CallbackParams {
  tag: string; // "FB" | "LINE" for logging
  functionName: string; // edge function name
  invokeBody: Record<string, unknown>;
  successLabel: string; // toast label
  returnUrlOverride?: string | null; // takes priority over sessionStorage
}

export interface CallbackResult {
  ok: boolean;
  redirectTo: string; // where caller should navigate
  successMessage?: string;
  errorMessage?: string;
  accessToken?: string;  // for cross-origin token handoff via URL fragment
  refreshToken?: string;
}

const DEFAULT_REDIRECT = "/member/orders";
const TIMEOUT_MS = 8000;

export type SessionHandoffTokens = { access?: string; refresh?: string };

function consumePostLoginRedirect(): string | null {
  const v = sessionStorage.getItem("post_login_redirect");
  if (v) sessionStorage.removeItem("post_login_redirect");
  return v;
}

function pickRedirect(override?: string | null): string {
  return override || consumePostLoginRedirect() || DEFAULT_REDIRECT;
}

/**
 * Decode `<random>.<base64url(returnUrl)>` state produced by the payment page.
 * Returns null if the state does not match this format or decoding fails.
 */
export function decodeReturnUrlFromState(state: string | null | undefined): string | null {
  if (!state || !state.includes(".")) return null;
  try {
    // Facebook: <random>.<returnB64>
    // LINE:     <random>.<returnB64>.<nonce>
    // Only the second segment is the encoded return URL.
    const b64 = state.split(".")[1];
    if (!b64) return null;
    const padded = b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4);
    const decoded = decodeURIComponent(escape(atob(padded)));
    if (/^https?:\/\//i.test(decoded)) return decoded;
    return null;
  } catch {
    return null;
  }
}

export async function preCheckExistingSession(
  tag: string,
  returnUrlOverride?: string | null,
): Promise<CallbackResult | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      console.log(`[${tag} callback] pre-check: session already present, skipping exchange`);
      return {
        ok: true,
        redirectTo: pickRedirect(returnUrlOverride),
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    }
  } catch (e) {
    console.warn(`[${tag} callback] pre-check getSession failed`, e);
  }
  return null;
}

export async function buildRedirectWithSessionHandoff(
  tag: string,
  path: string,
  tokens?: SessionHandoffTokens,
): Promise<string> {
  if (!/^https?:\/\//i.test(path)) return path;

  let target = path;
  try {
    const u = new URL(path);
    if (u.origin === window.location.origin) return target;

    let access = tokens?.access;
    let refresh = tokens?.refresh;

    if (!access || !refresh) {
      console.log(`[${tag} callback] cross-origin handoff needs tokens, reading current session`);
      const { data } = await supabase.auth.getSession();
      access = data?.session?.access_token;
      refresh = data?.session?.refresh_token;
    }

    if (access && refresh) {
      const existingHash = new URLSearchParams(u.hash.replace(/^#/, ""));
      existingHash.delete("access_token");
      existingHash.delete("refresh_token");
      existingHash.delete("source");
      const frag = new URLSearchParams({
        access_token: access,
        refresh_token: refresh,
        source: "oauth_handoff",
      });
      const preservedHash = existingHash.toString();
      u.hash = (preservedHash ? `${preservedHash}&` : "") + frag.toString();
      target = u.toString();
      console.log(`[${tag} callback] cross-origin handoff tokens appended`);
    } else {
      console.warn(`[${tag} callback] cross-origin handoff missing tokens`);
    }
  } catch (e) {
    console.warn(`[${tag} callback] build handoff URL failed`, e);
  }

  return target;
}

export async function runOAuthExchange(p: CallbackParams): Promise<CallbackResult> {
  const { tag, functionName, invokeBody, successLabel, returnUrlOverride } = p;

  // 8-second timeout fallback. Whatever happens, if a session exists when the
  // timer fires, treat as success.
  let timeoutHit = false;
  const timeoutPromise = new Promise<CallbackResult>((resolve) => {
    setTimeout(async () => {
      timeoutHit = true;
      console.warn(`[${tag} callback] exchange timeout (${TIMEOUT_MS}ms), re-checking session`);
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        console.log(`[${tag} callback] session present after timeout, navigating`);
        resolve({
          ok: true,
          redirectTo: pickRedirect(returnUrlOverride),
          successMessage: `${successLabel}登入成功`,
        });
      } else {
        resolve({
          ok: false,
          redirectTo: "/member/auth",
          errorMessage: `${successLabel}登入逾時，請重試`,
        });
      }
    }, TIMEOUT_MS);
  });

  const exchangePromise: Promise<CallbackResult> = (async () => {
    try {
      console.log(`[${tag} callback] exchange start →`, functionName);
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: invokeBody,
      });
      if (timeoutHit) {
        // Timeout already resolved; ignore late result.
        return { ok: false, redirectTo: "/member/auth" };
      }
      if (error) throw new Error(error.message || `${successLabel}授權碼交換失敗`);
      if (!data?.access_token || !data?.refresh_token) {
        throw new Error(data?.error || "未收到 Supabase session");
      }
      console.log(`[${tag} callback] exchange success, calling setSession`);

      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (setErr) throw setErr;

      // Confirm session is really there before navigating.
      const { data: confirm } = await supabase.auth.getSession();
      console.log(`[${tag} callback] session confirmed:`, !!confirm?.session?.user);
      let confirmedSession = confirm?.session;
      if (!confirmedSession?.user) {
        await new Promise((r) => setTimeout(r, 200));
        const { data: confirm2 } = await supabase.auth.getSession();
        confirmedSession = confirm2?.session;
        if (!confirmedSession?.user) {
          throw new Error("Session 建立失敗，請重試");
        }
      }

      return {
        ok: true,
        redirectTo: pickRedirect(returnUrlOverride),
        successMessage: `${successLabel}登入成功`,
        // Use the confirmed client session tokens, not the raw edge-function
        // tokens. setSession may rotate the refresh token; handing the old one
        // to another origin makes that origin fall back to the login page.
        accessToken: confirmedSession.access_token,
        refreshToken: confirmedSession.refresh_token,
      };
    } catch (err: any) {
      console.error(`[${tag} callback] exchange error`, err);
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        console.log(`[${tag} callback] session present despite error, navigating`);
        return {
          ok: true,
          redirectTo: pickRedirect(returnUrlOverride),
          successMessage: `${successLabel}登入成功`,
        };
      }
      return {
        ok: false,
        redirectTo: "/member/auth",
        errorMessage: err?.message || `${successLabel}登入失敗`,
      };
    }
  })();

  return Promise.race([exchangePromise, timeoutPromise]);
}
