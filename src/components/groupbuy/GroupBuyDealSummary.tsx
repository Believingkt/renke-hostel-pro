import { Check } from "lucide-react";

interface PkgLike {
  group_buy_price: number;
  original_price: number | null;
}

interface Props {
  packages: PkgLike[];
  depositPercentage: number;
  stayStart?: string | null;
  stayEnd?: string | null;
}

const twd = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;

/**
 * 團購優惠摘要：一律使用系統既有的方案價格計算，不顯示任何假造的稀缺 / 倒數資訊。
 */
export function GroupBuyDealSummary({ packages, depositPercentage, stayStart, stayEnd }: Props) {
  if (packages.length === 0) return null;

  const withOriginal = packages.filter((p) => (p.original_price ?? 0) > p.group_buy_price);
  const best =
    withOriginal.length > 0
      ? withOriginal.reduce((a, b) =>
          (b.original_price! - b.group_buy_price) > (a.original_price! - a.group_buy_price) ? b : a,
        )
      : null;
  const lowest = packages.reduce((a, b) => (b.group_buy_price < a.group_buy_price ? b : a));

  const save = best ? Math.round(best.original_price! - best.group_buy_price) : 0;
  const discountTenth = best ? Math.round((best.group_buy_price / best.original_price!) * 100) / 10 : 0;

  const bullets = [
    "團媽團購限定價格",
    stayStart || stayEnd
      ? `可入住期間 ${stayStart ?? "不限"} ~ ${stayEnd ?? "不限"}`
      : "指定期間皆可入住",
    `${depositPercentage}% 訂金即可保留房間`,
    "尾款入住現場支付",
  ];

  return (
    <section className="mt-6 rounded-3xl border border-primary/20 bg-secondary/50 p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-xs font-semibold tracking-wide text-accent-foreground">
            團購限定
          </span>
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-sm text-muted-foreground">最低團購價</span>
            <span className="text-[2rem] font-bold leading-none tracking-tight text-accent tabular-nums sm:text-[2.25rem]">
              {twd(lowest.group_buy_price)}
            </span>
            <span className="text-sm text-muted-foreground">／晚起</span>
          </div>
          {best && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
              <span className="text-muted-foreground/80 line-through tabular-nums">
                原價 {twd(best.original_price!)}
              </span>
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 font-semibold text-accent tabular-nums">
                最高現省 {twd(save)}
              </span>
              {discountTenth > 0 && discountTenth < 10 && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary tabular-nums">
                  約 {discountTenth.toFixed(1)} 折
                </span>
              )}
            </div>
          )}
        </div>

        <ul className="grid gap-1.5 sm:max-w-[300px]">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm leading-relaxed text-foreground/85">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default GroupBuyDealSummary;
