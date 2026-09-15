/**
 * 社群裂變推廣（D2）前端輔助工具。
 * 所有寫入行為一律走 referral-hook Edge Function（service role），前端只讀。
 */
import { supabase } from "@/integrations/supabase/client";

export const REFERRAL_STORAGE_KEY = "referral_invite_code";

export interface ReferralCampaign {
  id: string;
  accommodation_id: string | null;
  name: string;
  description: string | null;
  reward_tiers: RewardTier[];
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
}

export interface RewardTier {
  tier: number;
  condition?: string;
  reward_type?: "points" | "coupon";
  reward_value?: number;
}

export interface ReferralRecord {
  id: string;
  campaign_id: string;
  inviter_id: string | null;
  invite_code: string;
  invitee_id: string | null;
  invitee_order_id: string | null;
  tier: number;
  reward_type: string | null;
  reward_value: number;
  status: string;
  parent_record_id: string | null;
  click_count: number;
  rewarded_at: string | null;
  created_at: string;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "待點擊",
  clicked: "已點擊",
  registered: "已註冊",
  qualified: "已成單",
  rewarded: "已發放",
};

export const rewardTypeLabel = (t?: string | null) =>
  t === "coupon" ? "折價券" : t === "points" ? "紅利點數" : "—";

/** 邀請連結網址 */
export const referralUrl = (code: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/r/${code}`;

/** LINE 分享連結（share URL scheme，不需 Messaging API） */
export const lineShareUrl = (text: string, url: string) =>
  `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

async function invoke(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("referral-hook", {
    body: { action, ...payload },
  });
  if (error) throw error;
  return data as any;
}

/** 取得（必要時建立）我的邀請連結與成效 */
export async function getMyReferralLink() {
  return invoke("get_link");
}

/** 落地頁點擊追蹤 */
export async function trackReferralClick(code: string) {
  try {
    await invoke("track_click", { code });
  } catch {
    /* 追蹤失敗不影響瀏覽 */
  }
}

/** 註冊完成回填邀請關係 */
export async function registerReferral(code: string, memberId: string) {
  try {
    return await invoke("register", { code, member_id: memberId });
  } catch {
    return null;
  }
}

/** 成單歸因（最小 hook，失敗不影響訂單流程） */
export async function qualifyReferral(memberId: string, orderId?: string | null) {
  try {
    return await invoke("qualify", { member_id: memberId, order_id: orderId || null });
  } catch {
    return null;
  }
}

/** 暫存邀請碼（落地頁 → 註冊頁） */
export function rememberInviteCode(code: string) {
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, code);
  } catch {
    /* noop */
  }
}

export function readInviteCode(): string | null {
  try {
    return localStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearInviteCode() {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/** 依 auth user 取得 platform_members.id */
export async function currentMemberId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("platform_members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.id ?? null;
}
