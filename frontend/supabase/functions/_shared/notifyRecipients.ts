// 民宿／管理者訂單通知收件人解析（僅由後端從 DB 設定取得，永不接受前端傳入收件人）
// deno-lint-ignore-file no-explicit-any

export const MAX_NOTIFICATION_EMAILS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmails(list: unknown): string[] {
  const arr = Array.isArray(list) ? list : [];
  const out: string[] = [];
  for (const raw of arr) {
    const s = String(raw ?? "").trim().toLowerCase();
    if (!s || s.length > 254 || !EMAIL_RE.test(s)) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, MAX_NOTIFICATION_EMAILS);
}

/**
 * 解析順序：活動覆寫 → 民宿預設。兩者不合併。
 * 回傳 lowercase、去重、已排除退信名單（suppressed_emails）的收件人。
 */
export async function resolveOrderNotifyEmails(
  admin: any,
  params: { accommodationId?: string | null; campaignId?: string | null },
): Promise<{ emails: string[]; source: "campaign" | "accommodation" | "none" }> {
  let emails: string[] = [];
  let source: "campaign" | "accommodation" | "none" = "none";

  try {
    if (params.campaignId) {
      const { data } = await admin
        .from("group_buy_campaign_notification_settings")
        .select("notification_emails")
        .eq("campaign_id", params.campaignId)
        .maybeSingle();
      const list = normalizeEmails(data?.notification_emails);
      if (list.length > 0) {
        emails = list;
        source = "campaign";
      }
    }

    if (emails.length === 0 && params.accommodationId) {
      const { data } = await admin
        .from("accommodation_notification_settings")
        .select("booking_notification_emails")
        .eq("accommodation_id", params.accommodationId)
        .maybeSingle();
      const list = normalizeEmails(data?.booking_notification_emails);
      if (list.length > 0) {
        emails = list;
        source = "accommodation";
      }
    }

    if (emails.length > 0) {
      const { data: suppressed } = await admin
        .from("suppressed_emails")
        .select("email")
        .in("email", emails);
      const blocked = new Set((suppressed ?? []).map((r: any) => String(r.email ?? "").toLowerCase()));
      emails = emails.filter((e) => !blocked.has(e));
    }
  } catch (e) {
    console.error("[notifyRecipients] resolve failed", e);
    return { emails: [], source: "none" };
  }

  return { emails, source: emails.length > 0 ? source : "none" };
}
