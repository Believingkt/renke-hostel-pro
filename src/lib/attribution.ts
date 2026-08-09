import { supabase } from "@/integrations/supabase/client";

/**
 * 廣告歸因（首次接觸 + 最後點擊 雙軌）
 * - 首次接觸：第一次帶著 utm / fbclid / LINE 來源參數進站時記錄，30 天視窗
 * - 最後點擊：每次帶參數進站都覆蓋
 * 存在 localStorage，下單時寫入 order_attributions。
 */

const FIRST_KEY = "attr_first_touch";
const LAST_KEY = "attr_last_touch";
const WINDOW_DAYS = 30;

export interface TouchData {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  referrer_domain: string | null;
  fbclid: string | null;
  line_source_param: string | null;
  ad_id: string | null;
  campaign_id: string | null;
  landing_path: string | null;
  touched_at: string;
}

const domainOf = (url: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

const readTouch = (key: string): TouchData | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TouchData;
    if (!parsed?.touched_at) return null;
    const age = Date.now() - new Date(parsed.touched_at).getTime();
    if (age > WINDOW_DAYS * 86400000) return null;
    return parsed;
  } catch {
    return null;
  }
};

const buildTouch = (): TouchData | null => {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const utm_source = p.get("utm_source");
  const utm_medium = p.get("utm_medium");
  const utm_campaign = p.get("utm_campaign");
  const utm_content = p.get("utm_content");
  const fbclid = p.get("fbclid");
  // LINE 加好友 / LINE 導流帶的來源參數（支援多種常見命名）
  const line_source_param =
    p.get("line_src") || p.get("liff_src") || p.get("oat_content") || null;
  const ad_id = p.get("ad_id") || p.get("adid") || null;
  const campaign_id = p.get("campaign_id") || p.get("cid") || null;
  const referrer_domain = domainOf(document.referrer || null);

  const hasSignal =
    utm_source || utm_medium || utm_campaign || utm_content ||
    fbclid || line_source_param || ad_id || campaign_id;

  // 沒有任何廣告訊號時，只有在完全沒有紀錄的情況下才記自然流量
  if (!hasSignal && (readTouch(FIRST_KEY) || readTouch(LAST_KEY))) return null;

  return {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    referrer_domain,
    fbclid,
    line_source_param,
    ad_id,
    campaign_id,
    landing_path: window.location.pathname,
    touched_at: new Date().toISOString(),
  };
};

/** 每次載入頁面時呼叫，記錄首次接觸與最後點擊 */
export const captureTouch = () => {
  try {
    const touch = buildTouch();
    if (!touch) return;
    if (!readTouch(FIRST_KEY)) {
      localStorage.setItem(FIRST_KEY, JSON.stringify(touch));
    }
    localStorage.setItem(LAST_KEY, JSON.stringify(touch));
  } catch {
    /* localStorage 不可用時忽略 */
  }
};

/** 訂單成立後寫入歸因（失敗不影響訂單流程） */
export const recordOrderAttribution = async (
  orderId: string,
  accommodationId: string | null,
) => {
  try {
    const first = readTouch(FIRST_KEY);
    const last = readTouch(LAST_KEY) || first;
    if (!first && !last) return;

    let sessionId: string | null = null;
    try {
      sessionId = sessionStorage.getItem("analytics_session_id");
    } catch {
      sessionId = null;
    }

    await supabase.from("order_attributions").insert({
      order_id: orderId,
      accommodation_id: accommodationId,
      session_id: sessionId,
      first_utm_source: first?.utm_source ?? null,
      first_utm_medium: first?.utm_medium ?? null,
      first_utm_campaign: first?.utm_campaign ?? null,
      first_utm_content: first?.utm_content ?? null,
      first_touch_at: first?.touched_at ?? null,
      last_utm_source: last?.utm_source ?? null,
      last_utm_medium: last?.utm_medium ?? null,
      last_utm_campaign: last?.utm_campaign ?? null,
      last_utm_content: last?.utm_content ?? null,
      last_touch_at: last?.touched_at ?? null,
      referrer_domain: last?.referrer_domain ?? first?.referrer_domain ?? null,
      fbclid: last?.fbclid ?? first?.fbclid ?? null,
      line_source_param: last?.line_source_param ?? first?.line_source_param ?? null,
      ad_id: last?.ad_id ?? first?.ad_id ?? null,
      campaign_id: last?.campaign_id ?? first?.campaign_id ?? null,
      landing_path: first?.landing_path ?? null,
    });
  } catch (e) {
    console.warn("attribution record failed", e);
  }
};
