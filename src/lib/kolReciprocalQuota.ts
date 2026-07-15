import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * KOL 互惠每月額度檢查
 * - 歸屬月份：以入住日 (check_in_date) 為準
 * - 範圍：每家民宿獨立
 * - 支援兩種模式（accommodation_info.kol_quota_mode）：
 *   - shared: 全民宿共用一個額度（package_id = NULL 的 quota row）
 *   - per_package:
 *     - 訂單包棟屬於「追蹤清單 (kol_quota_tracked_package_ids)」→ 使用該包棟專屬額度
 *       - 未設定該月專屬額度 → 視為 0（禁止建立，允許管理員強制覆寫）
 *     - 訂單包棟未在追蹤清單、或訂單無 package_id → 併入全館共用額度
 * - 軟攔截：超額時呼叫 confirmFn 由 UI 決定是否強制
 */

export type KolQuotaMode = "shared" | "per_package";

export interface KolQuotaStatus {
  yearMonth: string;
  quota: number | null; // null = 未設定上限
  used: number;
  willExceed: boolean;
  willReach: boolean;
  scope: "shared" | "package"; // 依哪個範圍計算
  packageId: string | null;
  packageName?: string | null;
}

interface AccommodationQuotaConfig {
  mode: KolQuotaMode;
  trackedPackageIds: string[];
}

async function fetchAccommodationConfig(
  accommodationId: string,
): Promise<AccommodationQuotaConfig> {
  const { data } = await (supabase as any)
    .from("accommodation_info")
    .select("kol_quota_mode, kol_quota_tracked_package_ids")
    .eq("id", accommodationId)
    .maybeSingle();
  const mode = (data?.kol_quota_mode as KolQuotaMode) || "shared";
  const trackedPackageIds = (data?.kol_quota_tracked_package_ids as string[] | null) || [];
  return { mode, trackedPackageIds };
}

/**
 * 取得指定民宿/月份/包棟的 KOL 互惠額度與使用量
 */
export async function fetchKolQuotaStatus(params: {
  accommodationId: string;
  checkInDate: string; // yyyy-MM-dd
  packageId?: string | null;
  excludeOrderId?: string | null;
}): Promise<KolQuotaStatus> {
  const { accommodationId, checkInDate, packageId, excludeOrderId } = params;
  const yearMonth = checkInDate.slice(0, 7);

  const config = await fetchAccommodationConfig(accommodationId);

  // 決定實際採用哪個範圍的額度
  const inTracked = !!packageId && config.trackedPackageIds.includes(packageId);
  const useScope: "shared" | "package" =
    config.mode === "per_package" && inTracked ? "package" : "shared";
  const effectivePackageId = useScope === "package" ? packageId! : null;

  // 撈 quota row
  let quotaQuery = supabase
    .from("kol_reciprocal_monthly_quotas")
    .select("quota")
    .eq("accommodation_id", accommodationId)
    .eq("year_month", yearMonth);
  quotaQuery = effectivePackageId
    ? quotaQuery.eq("package_id", effectivePackageId)
    : quotaQuery.is("package_id", null);
  const quotaRes = await quotaQuery.maybeSingle();

  const countRes = await supabase.rpc("count_kol_reciprocal_orders", {
    _accommodation_id: accommodationId,
    _year_month: yearMonth,
    _exclude_order_id: excludeOrderId ?? null,
    _package_id: effectivePackageId as any,
  } as any);

  let packageName: string | null = null;
  if (effectivePackageId) {
    const { data: pkg } = await supabase
      .from("accommodation_packages")
      .select("name")
      .eq("id", effectivePackageId)
      .maybeSingle();
    packageName = (pkg as any)?.name ?? null;
  }

  let quota: number | null = quotaRes.data?.quota ?? null;
  // per_package 模式：追蹤包棟但未設定 → 視為 0
  if (useScope === "package" && quota == null) {
    quota = 0;
  }

  const used = (countRes.data as number | null) ?? 0;
  const next = used + 1;

  return {
    yearMonth,
    quota,
    used,
    willExceed: quota != null && next > quota,
    willReach: quota != null && next === quota,
    scope: useScope,
    packageId: effectivePackageId,
    packageName,
  };
}

/**
 * 整合性檢查（軟攔截）
 * @returns true 表示可繼續，false 表示中止
 */
export async function ensureKolQuotaPermit(opts: {
  accommodationId: string | null | undefined;
  orderSource: string | null | undefined;
  checkInDate: string | null | undefined;
  packageId?: string | null;
  excludeOrderId?: string | null;
  isAdmin: boolean;
  confirmOverride: (status: KolQuotaStatus) => Promise<boolean>;
  onOverride?: (status: KolQuotaStatus) => void;
}): Promise<boolean> {
  const { accommodationId, orderSource, checkInDate, packageId, excludeOrderId, confirmOverride, onOverride } = opts;

  if (orderSource !== "kol") return true;
  if (!accommodationId || !checkInDate) return true;

  let status: KolQuotaStatus;
  try {
    status = await fetchKolQuotaStatus({ accommodationId, checkInDate, packageId, excludeOrderId });
  } catch (e) {
    console.error("[KolQuota] 查詢失敗", e);
    return true;
  }

  if (status.quota == null) return true;

  if (!status.willExceed) {
    if (status.willReach) {
      const scopeLabel = status.scope === "package" && status.packageName
        ? `${status.packageName}｜${status.yearMonth}`
        : status.yearMonth;
      toast({
        title: `本月 KOL 互惠即將達上限`,
        description: `${scopeLabel} 已使用 ${status.used + 1}/${status.quota} 筆`,
      });
    }
    return true;
  }

  const confirmed = await confirmOverride(status);
  if (confirmed) onOverride?.(status);
  return confirmed;
}

/**
 * 記錄 KOL 互惠額度覆寫至 audit_logs
 */
export async function logKolQuotaOverride(params: {
  orderId: string;
  orderNumber?: string | null;
  accommodationId: string;
  status: KolQuotaStatus;
  context?: "create" | "edit" | "source_change";
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    const operatorName = profile?.name || user.email || "未知使用者";
    const contextLabel =
      params.context === "create" ? "新建訂單"
      : params.context === "source_change" ? "變更來源為 KOL 互惠"
      : "編輯訂單";
    const scopeLabel = params.status.scope === "package" && params.status.packageName
      ? `${params.status.packageName}（${params.status.yearMonth}）`
      : `全館（${params.status.yearMonth}）`;

    await supabase.from("audit_logs").insert([{
      user_id: user.id,
      user_email: user.email,
      action_type: "update",
      action_category: "order",
      entity_type: "order",
      entity_id: params.orderId,
      entity_name: params.orderNumber ?? null,
      details: {
        type: "kol_quota_override",
        context: params.context ?? "edit",
        year_month: params.status.yearMonth,
        quota: params.status.quota,
        used_before: params.status.used,
        used_after: params.status.used + 1,
        scope: params.status.scope,
        package_id: params.status.packageId,
        package_name: params.status.packageName ?? null,
        operator_name: operatorName,
        changes: [
          {
            field: "kol_quota_override",
            label: "KOL 互惠額度覆寫",
            before: `${params.status.used}/${params.status.quota}（${scopeLabel}）`,
            after: `${params.status.used + 1}/${params.status.quota}（超額 +${(params.status.used + 1) - (params.status.quota ?? 0)}）`,
          },
          {
            field: "kol_quota_override_context",
            label: "操作情境",
            before: "-",
            after: contextLabel,
          },
          {
            field: "kol_quota_override_operator",
            label: "覆寫者",
            before: "-",
            after: operatorName,
          },
        ],
      } as any,
    }]);
  } catch (e) {
    console.error("[KolQuota] 寫入覆寫紀錄失敗", e);
  }
}
