// 團購訂單「下單當下訂房須知」快照建立（immutable，僅建單時寫入一次）
// deno-lint-ignore-file no-explicit-any

import { applyVisibleKeys, buildBookingNoticePanels, type BookingNoticePanel } from "./bookingNoticePanels.ts";

export const BOOKING_NOTICE_SNAPSHOT_VERSION = 1;

export interface BookingNoticeSnapshot {
  version: number;
  captured_at: string;
  campaign_id: string | null;
  accommodation_id: string | null;
  visible_keys: string[];
  /** 下單當下實際對客顯示的正式訂房須知（已套用 booking_notice_keys） */
  sections: BookingNoticePanel[];
  /** 入住前提醒（訂單成立後才顯示的補充資訊），與正式訂房須知分開保存 */
  post_booking_notice: string | null;
}

/**
 * 讀取當下 live 資料 → 套用 campaign.booking_notice_keys → 產生 self-contained 快照。
 * 即使完全沒有規則，也會回傳合法快照（sections: []），以區分「當時沒有規則」與「舊訂單無快照」。
 */
export async function buildBookingNoticeSnapshot(
  admin: any,
  params: { accommodationId: string | null; campaignId: string | null; visibleKeys?: string[] | null },
): Promise<BookingNoticeSnapshot> {
  const { accommodationId, campaignId } = params;
  const empty: BookingNoticeSnapshot = {
    version: BOOKING_NOTICE_SNAPSHOT_VERSION,
    captured_at: new Date().toISOString(),
    campaign_id: campaignId ?? null,
    accommodation_id: accommodationId ?? null,
    visible_keys: [],
    sections: [],
    post_booking_notice: null,
  };
  if (!accommodationId) return empty;

  try {
    const [{ data: acc }, { data: bookingSettings }, { data: customSections }, { data: intro }] = await Promise.all([
      admin.from("accommodation_info").select("check_in_notice").eq("id", accommodationId).maybeSingle(),
      admin.from("booking_settings").select("*").eq("accommodation_id", accommodationId).maybeSingle(),
      admin
        .from("custom_sections")
        .select("id, section_title, section_subtitle, section_content, display_order, is_enabled")
        .eq("accommodation_id", accommodationId)
        .order("display_order"),
      admin
        .from("group_buy_venue_intros")
        .select("check_in_notice")
        .eq("accommodation_id", accommodationId)
        .maybeSingle(),
    ]);

    const sections = applyVisibleKeys(
      buildBookingNoticePanels(bookingSettings ?? null, (acc as any)?.check_in_notice ?? null, (customSections ?? []) as any[]),
      params.visibleKeys ?? null,
    );

    return {
      ...empty,
      visible_keys: sections.map((s) => s.key),
      sections,
      post_booking_notice: (intro as any)?.check_in_notice ?? null,
    };
  } catch (e) {
    console.error("[groupBuyBookingNoticeSnapshot] build failed", e);
    return empty;
  }
}
