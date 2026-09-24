// Detect popular in-app browsers by User-Agent.
// We only use this to warn users when they're trying to log in with a
// competing provider inside a walled-garden webview (e.g. Facebook login
// inside the LINE in-app browser routinely fails silently).

export type InAppBrowserKind = "line" | "facebook" | "instagram" | null;

export function detectInAppBrowser(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): InAppBrowserKind {
  if (!ua) return null;
  // LINE browser: "Line/12.3.4"
  if (/\bLine\//i.test(ua)) return "line";
  // Facebook: FBAN (native app) / FBAV (version) / FB_IAB (in-app browser)
  if (/\bFB(AN|AV|_IAB)\b/i.test(ua)) return "facebook";
  // Instagram in-app browser
  if (/\bInstagram\b/i.test(ua)) return "instagram";
  return null;
}

export function inAppBrowserLabel(kind: InAppBrowserKind): string {
  if (kind === "line") return "LINE";
  if (kind === "facebook") return "Facebook";
  if (kind === "instagram") return "Instagram";
  return "內建";
}

/**
 * Should we block the user from launching this OAuth provider inside the
 * current in-app browser? Rule: cross-provider is blocked (LINE inside FB IAB
 * or vice versa). Same-provider (LINE inside LINE, FB inside FB) is allowed
 * because those flows work.
 */
export function shouldBlockOAuthInApp(
  targetProvider: "line" | "facebook",
  currentBrowser: InAppBrowserKind = detectInAppBrowser(),
): boolean {
  if (!currentBrowser) return false;
  if (targetProvider === currentBrowser) return false;
  return currentBrowser === "line" || currentBrowser === "facebook" || currentBrowser === "instagram";
}
