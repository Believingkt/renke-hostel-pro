import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PUBLISH_DEADLINE_DAYS,
  addDaysYmd,
  hasVal,
  taipeiToday,
} from "@/lib/kolPublishSchedule";
import type { TeamNotification } from "@/lib/notifications/types";

/**
 * KOL 進度事件通知（衍生式，不建表）。
 *
 * 目前涵蓋三種情境：
 *  A. kol-qualification（建議／黃）：星探建立了正式邀約，但星探主管尚未勾選「累積資格」
 *  B. kol-publish-overdue（建議／黃）：已過預計上片日（入住日 + 14 天），仍缺發布日期或發布連結
 *  C. kol-cid-missing（嚴重／紅）：已到入住日，折扣碼 / CID 仍未建立完成（不再檢查 legacy short_url）
 *
 * 通知對象：super_admin / admin / scout_manager / scout（scout 只會看到 RLS 允許的自家資料）。
 */

const KOL_ROLES = ["super_admin", "admin", "scout_manager", "scout"];
const QUALIFICATION_ROLES = ["super_admin", "admin", "scout_manager"];
/** 新邀約待勾選資格的回溯天數（避免整份歷史名單都跳通知） */
const QUALIFICATION_LOOKBACK_DAYS = 30;

const KOL_HREF = "/team/kol?tab=invitations";

interface KolRow {
  id: string;
  name: string | null;
  venue_name: string | null;
  check_in_date: string | null;
  invited_at: string | null;
  publish_date: string | null;
  publish_url: string | null;
  cid_code: string | null;
  kpi_qualified: boolean | null;
  is_error: boolean | null;
  booking_status: string | null;
  rarity: string | null;
  primary_profile_id: string | null;
}

/** 這些訂房狀態不需要（也不該）勾選累積資格 */
const QUALIFICATION_EXCLUDED_STATUS = ["已取消"];

function label(row: KolRow): string {
  const who = row.name?.trim() || "未命名 KOL";
  return row.venue_name?.trim() ? `${who}｜${row.venue_name}` : who;
}

export function buildKolNotifications(
  rows: KolRow[],
  roles: string[],
  today: string = taipeiToday(),
): TeamNotification[] {
  const canEdit = roles.some((r) => KOL_ROLES.includes(r));
  const canQualify = roles.some((r) => QUALIFICATION_ROLES.includes(r));
  const out: TeamNotification[] = [];
  const lookbackFrom = addDaysYmd(today, -QUALIFICATION_LOOKBACK_DAYS);

  for (const row of rows) {
    if (row.is_error) continue;
    // 已取消的邀約不需要任何後續補件通知
    if (QUALIFICATION_EXCLUDED_STATUS.includes(String(row.booking_status ?? ""))) continue;

    // A. 待勾選累積資格
    // 只在「這筆確實需要被勾選」時才提醒：
    //  - 有填寫日期且在回溯期內
    //  - 有入住日（kpi_eligible 的判定基礎）
    //  - 非 ck（揪客）稀有度：規則上不可勾選符合資格
    //  - 非同住夥伴（primary_profile_id 有值時一律不列入 KPI）
    const qualificationApplicable =
      !row.kpi_qualified &&
      hasVal(row.invited_at) &&
      String(row.invited_at).slice(0, 10) >= lookbackFrom &&
      hasVal(row.check_in_date) &&
      String(row.rarity ?? "").toLowerCase() !== "ck" &&
      !hasVal(row.primary_profile_id);

    if (canQualify && qualificationApplicable) {
      out.push({
        id: `kol:qualification:${row.id}`,
        kind: "kol-qualification",
        category: "kol",
        severity: "warn",
        scope: label(row),
        title: "待勾選累積資格",
        detail: `邀約已建立（${String(row.invited_at).slice(0, 10)}），星探主管尚未勾選「累積資格」，此筆不會計入星探級距。`,
        href: `${KOL_HREF}&kolId=${row.id}`,
        editable: true,
        reason: null,
        meta: [
          { label: "資料表", value: "kol_profiles.kpi_qualified" },
          { label: "誰能編輯", value: "super_admin、admin、scout_manager" },
          { label: "排除條件", value: "已取消、稀有度 ck（揪客）、同住夥伴（附屬記錄）、無入住日者不提醒。" },
          { label: "怎麼處理", value: "團隊後台 →「KOL 星探」→ 正式邀約 → 開啟該筆 → 勾選累積資格。" },
        ],
      });
    }

    // B. 上片逾期未填發布資料（提醒性質，列為建議黃燈）
    const deadline = hasVal(row.check_in_date)
      ? addDaysYmd(String(row.check_in_date), PUBLISH_DEADLINE_DAYS)
      : null;
    const published = hasVal(row.publish_date) && hasVal(row.publish_url);

    // B2. 當日上片名單（與 LINE 每日推播同口徑：入住日 = 今天 − 14 天）
    // 有上片連結 → 已上片（資訊）；沒有 → 未上片追蹤（提醒）
    const isTodayCohort = hasVal(row.check_in_date) && deadline === today;
    if (isTodayCohort) {
      if (hasVal(row.publish_url)) {
        out.push({
          id: `kol:publish-today-uploaded:${row.id}`,
          kind: "kol-publish-today-uploaded",
          category: "kol",
          severity: "info",
          scope: label(row),
          title: "今日名單・已上片",
          detail: `發布日期 ${hasVal(row.publish_date) ? String(row.publish_date) : "未填"}，上片連結：${row.publish_url}`,
          href: `${KOL_HREF}&kolId=${row.id}`,
          editable: canEdit,
          reason: canEdit ? null : "你沒有編輯 KOL 邀約的權限。",
          meta: [
            { label: "口徑", value: `入住日 + ${PUBLISH_DEADLINE_DAYS} 天 = 今天，與 LINE 每日提醒相同` },
            { label: "入住日期", value: String(row.check_in_date) },
            { label: "上片連結", value: String(row.publish_url) },
          ],
        });
      } else {
        out.push({
          id: `kol:publish-today-pending:${row.id}`,
          kind: "kol-publish-today-pending",
          category: "kol",
          severity: "warn",
          scope: label(row),
          title: "今日名單・未上片",
          detail: `上片期限 ${today} 到期，尚未回填上片連結，請星探追蹤。`,
          href: `${KOL_HREF}&kolId=${row.id}`,
          editable: canEdit,
          reason: canEdit ? null : "你沒有編輯 KOL 邀約的權限，請通知該筆的星探。",
          meta: [
            { label: "口徑", value: `入住日 + ${PUBLISH_DEADLINE_DAYS} 天 = 今天，與 LINE 每日提醒相同` },
            { label: "入住日期", value: String(row.check_in_date) },
            { label: "怎麼處理", value: "團隊後台 →「KOL 星探」→ 正式邀約 → 回填發布日期與連結。" },
          ],
        });
      }
    }

    if (deadline && !published && deadline < today) {
      out.push({
        id: `kol:publish:${row.id}`,
        kind: "kol-publish-overdue",
        category: "kol",
        severity: "warn",
        scope: label(row),
        title: "上片逾期未回填",
        detail: `預計上片日 ${deadline} 已過，仍缺${hasVal(row.publish_date) ? "" : "發布日期"}${!hasVal(row.publish_date) && !hasVal(row.publish_url) ? "與" : ""}${hasVal(row.publish_url) ? "" : "發布連結"}。`,
        href: `${KOL_HREF}&kolId=${row.id}`,
        editable: canEdit,
        reason: canEdit ? null : "你沒有編輯 KOL 邀約的權限，請通知該筆的星探。",
        meta: [
          { label: "資料表", value: "kol_profiles.publish_date / publish_url" },
          { label: "口徑", value: `預計上片日 = 入住日 + ${PUBLISH_DEADLINE_DAYS} 天` },
          { label: "怎麼處理", value: "團隊後台 →「KOL 星探」→ 正式邀約 → 回填發布日期與連結。" },
        ],
      });
    }

    // C. 已到入住日但折扣碼／CID 未建立完成
    if (hasVal(row.check_in_date) && String(row.check_in_date) <= today) {
      const missing: string[] = [];
      if (!hasVal(row.cid_code)) missing.push("折扣碼 / CID");
      if (missing.length > 0) {
        out.push({
          id: `kol:cid:${row.id}`,
          kind: "kol-cid-missing",
          category: "kol",
          severity: "error",
          scope: label(row),
          title: "折扣碼／CID 未建立完成",
          detail: `入住日 ${row.check_in_date} 已到，仍缺 ${missing.join("、")}，此筆業績無法歸戶。`,
          href: `${KOL_HREF}&kolId=${row.id}`,
          editable: canEdit,
          reason: canEdit ? null : "你沒有編輯 KOL 邀約的權限，請通知該筆的星探。",
          meta: [
            { label: "資料表", value: "kol_profiles.cid_code" },
            { label: "怎麼處理", value: "團隊後台 →「KOL 星探」→ 正式邀約 → 建立折扣碼 / CID。" },
          ],
        });
      }
    }
  }

  const weight = (n: TeamNotification) => (n.severity === "error" ? 0 : 1);
  return out.sort((a, b) => weight(a) - weight(b));
}

export function useKolNotifications(roles: string[]) {
  const enabled = roles.some((r) => KOL_ROLES.includes(r));
  const [items, setItems] = useState<TeamNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("kol_profiles")
        .select(
          "id,name,venue_name,check_in_date,invited_at,publish_date,publish_url,cid_code,kpi_qualified,is_error,booking_status,rarity,primary_profile_id",
        )
        .order("check_in_date", { ascending: false })
        .limit(600);
      if (error) throw error;
      setItems(buildKolNotifications((data ?? []) as unknown as KolRow[], roles));
    } catch {
      // RLS 擋住或查詢失敗時不製造假通知
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, roles.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, loading, reload };
}
