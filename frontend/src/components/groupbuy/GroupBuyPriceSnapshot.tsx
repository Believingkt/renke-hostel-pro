import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GROUP_BUY_DAY_TYPE_LABEL, type GroupBuyDayType } from "@/lib/groupBuyPricing";

export interface ChildTierBreakdownSnapshot {
  key: string;
  label: string;
  count: number;
  base_count?: number;
  fee_per_night?: number;
  over_count?: number;
  over_limit_fee_per_night?: number;
  nights?: number;
  subtotal: number;
  free?: boolean;
}

export interface PriceSnapshot {
  nightly_breakdown?: Array<{ date: string; type: GroupBuyDayType; price: number }> | null;
  child_breakdown?: ChildTierBreakdownSnapshot[] | null;
  prices_at_booking?: {
    group_buy_price?: number | null;
    weekday_price?: number | null;
    peak_price?: number | null;
    holiday_price?: number | null;
  } | null;
  base_accommodation_total?: number | null;
  child_extra_total?: number | null;
  grand_total?: number | null;
  deposit?: number | null;
  balance?: number | null;
}

const twd = (n?: number | null) => `NT$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
const fmtDate = (d: string) => String(d).slice(0, 10).replace(/-/g, "/");

/** 訂單價格快照：全部讀 group_buy_commissions.price_snapshot，不重新讀取目前方案價格 */
export function GroupBuyPriceSnapshot({ snapshot }: { snapshot?: PriceSnapshot | null }) {
  const [open, setOpen] = useState(false);
  const nights = snapshot?.nightly_breakdown ?? [];

  if (!snapshot || (nights.length === 0 && snapshot.grand_total == null)) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        此訂單建立時尚未保存逐晚價格快照。
      </p>
    );
  }

  const row = (label: string, value?: number | null) => (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{twd(value)}</span>
    </div>
  );

  const pab = snapshot.prices_at_booking ?? {};

  return (
    <div className="space-y-2 rounded-lg border p-3">
      {row("住宿費", snapshot.base_accommodation_total)}
      {row("兒童加價", snapshot.child_extra_total)}
      {(snapshot.child_breakdown ?? []).length > 0 && (
        <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
          {(snapshot.child_breakdown ?? []).map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3">
              <span>
                {c.label} × {c.count}
                {c.over_count ? `（含超額 ${c.over_count} 位）` : ""}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {c.free
                  ? "免費"
                  : `${twd(c.fee_per_night)}/人/晚 × ${c.base_count ?? c.count} 位 × ${c.nights ?? 1} 晚`}
              </span>
              <span className="tabular-nums font-medium">{twd(c.subtotal)}</span>
            </div>
          ))}
        </div>
      )}
      {row("訂單總額", snapshot.grand_total)}
      {row("訂金", snapshot.deposit)}
      {row("尾款", snapshot.balance)}

      {nights.length > 0 && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-between px-2"
            onClick={() => setOpen((v) => !v)}
          >
            查看逐晚價格
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
          {open && (
            <div className="space-y-1 rounded-md bg-muted/50 p-2">
              {nights.map((n) => (
                <div key={n.date} className="flex items-center justify-between gap-3 text-sm">
                  <span className="tabular-nums">{fmtDate(n.date)}</span>
                  <span className="text-muted-foreground">{GROUP_BUY_DAY_TYPE_LABEL[n.type] ?? n.type}</span>
                  <span className="tabular-nums font-medium">{twd(n.price)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {pab.group_buy_price != null && (
        <div className="border-t pt-2 text-xs text-muted-foreground">
          <p className="mb-1">訂單建立當下價格設定（未設定則沿用團購價）</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
            <span>平日價 {twd(pab.weekday_price ?? pab.group_buy_price)}</span>
            <span>旺日價 {twd(pab.peak_price ?? pab.group_buy_price)}</span>
            <span>假日價 {twd(pab.holiday_price ?? pab.group_buy_price)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default GroupBuyPriceSnapshot;
