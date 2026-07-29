import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Users, Tag, Home, Check, X, Plus, Sparkles } from "lucide-react";
import { OriginalPrice, SavingsBadge } from "./SavingsBadge";


interface PackageInclude {
  text: string;
  available: "yes" | "no" | "optional";
  price_note?: string;
}

interface SelectedPackage {
  name: string | null;
  subtitle: string | null;
  room_type_allocation: Array<{ room_type_id: string; qty: number }>;
  includes: PackageInclude[];
}

interface AddonLine {
  label: string;
  qty: string;
  subtotal: number;
}

interface Props {
  accommodationName?: string;
  checkInDate: Date | null;
  checkOutDate: Date | null;
  calculateNights: () => number;
  totalGuests: number;
  adultsCount?: number;
  childrenCount?: number;
  infantsCount?: number;
  toddlersCount?: number;
  selectedRoom: any;
  selectedPackage?: SelectedPackage | null;
  roomAllocation?: string | null;
  roomTypes?: Array<{ id: string; name: string }>;
  roomsCount?: number;
  roomSubtotal?: number;
  /** 方案「原價（劃掉用）」總額；大於房費時顯示劃掉價與折扣% */
  roomOriginalSubtotal?: number | null;

  addonLines?: AddonLine[];
  calculateFinalTotal: () => number;
  appliedDiscount: { code: string; type?: string; value?: number } | null;
  calculateDiscount: () => number;
  /** mobile：僅手機顯示；desktop：僅桌機側欄顯示（sticky） */
  variant?: "mobile" | "desktop";
}


/**
 * Booking.com 風格的行動版訂單摘要卡片。
 * 顯示於單頁結帳最上方，包含民宿名稱、日期、房間搭配與尊榮禮遇內容。
 */
export default function MobileOrderSummary({
  accommodationName,
  checkInDate,
  checkOutDate,
  calculateNights,
  totalGuests,
  adultsCount,
  childrenCount,
  infantsCount,
  toddlersCount,
  selectedRoom,
  selectedPackage,
  roomAllocation,
  roomTypes,
  roomsCount,
  roomSubtotal,
  roomOriginalSubtotal,

  addonLines,
  calculateFinalTotal,
  appliedDiscount,
  calculateDiscount,
  variant = "mobile",
}: Props) {
  if (!checkInDate || !checkOutDate) return null;


  const nights = calculateNights();
  const finalTotal = calculateFinalTotal();
  const discount = calculateDiscount();

  const guestParts: string[] = [];
  if (adultsCount && adultsCount > 0) guestParts.push(`${adultsCount} 位大人`);
  if (childrenCount && childrenCount > 0) guestParts.push(`${childrenCount} 位兒童`);
  if (toddlersCount && toddlersCount > 0) guestParts.push(`${toddlersCount} 位幼兒`);
  if (infantsCount && infantsCount > 0) guestParts.push(`${infantsCount} 位嬰兒`);
  const guestLabel = guestParts.length > 0 ? guestParts.join("・") : `入住 ${totalGuests} 人`;

  const formatDate = (d: Date) => format(d, "M 月 d 日 EEE", { locale: zhTW });

  // 房間搭配：優先使用套裝的 room_allocation 文字（例：四人房x3），
  // 其次用 room_type_allocation 明細，最後 fallback 到「所選房型×房間數」
  const packageAllocationText = roomAllocation && roomAllocation.trim() ? roomAllocation.trim() : "";

  const allocationBreakdown =
    selectedPackage?.room_type_allocation
      ?.map((a) => {
        const rt = roomTypes?.find((r) => r.id === a.room_type_id);
        return rt ? `${rt.name}×${a.qty}` : null;
      })
      .filter(Boolean)
      .join("・") || "";

  const fallbackBreakdown =
    selectedRoom?.name && roomsCount && roomsCount > 0
      ? `${selectedRoom.name}×${roomsCount}`
      : "";

  const roomBreakdown = packageAllocationText || allocationBreakdown || fallbackBreakdown;

  const includes = (selectedPackage?.includes || []).filter((i) => i?.text);
  const packageTitle = selectedPackage?.name || selectedRoom?.name;
  const perkTitle = selectedPackage?.subtitle || "尊榮禮遇";

  return (
    <div className={variant === "desktop" ? "hidden lg:block" : "lg:hidden mb-4"}>

      <div className="rounded-xl border-2 border-border bg-card overflow-hidden shadow-sm">
        {/* 民宿名稱 - 放大並置中 */}
        {accommodationName && (
          <div className="px-4 py-4 bg-primary/10 border-b border-border text-center">
            <p className="text-xl font-extrabold text-primary tracking-wide leading-tight">
              {accommodationName}
            </p>
          </div>
        )}

        {/* 日期列 */}
        <div className="px-4 py-3 flex items-stretch justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">入住</p>
            <p className="text-base font-bold text-foreground leading-tight">
              {formatDate(checkInDate)}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center px-2 shrink-0">
            <div className="h-px w-6 bg-border" />
            <span className="text-xs text-muted-foreground my-1">{nights} 晚</span>
            <div className="h-px w-6 bg-border" />
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-xs text-muted-foreground mb-1">退房</p>
            <p className="text-base font-bold text-foreground leading-tight">
              {formatDate(checkOutDate)}
            </p>
          </div>
        </div>

        {/* 房間搭配 */}
        {(roomBreakdown || packageTitle) && (
          <div className="border-t border-border px-4 py-3 space-y-1">
            <p className="text-[10px] font-bold tracking-[0.18em] text-muted-foreground/80">
              ROOM ALLOCATION
            </p>
            {roomBreakdown ? (
              <p className="text-sm font-bold text-foreground leading-snug">
                <span className="mr-1" aria-hidden>👆</span>
                房間搭配：{roomBreakdown}
              </p>
            ) : (
              <p className="text-sm font-bold text-foreground leading-snug">{packageTitle}</p>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground pt-0.5">
              <Users className="h-3.5 w-3.5" />
              <span>{guestLabel}</span>
            </div>
          </div>
        )}

        {/* 尊榮禮遇 */}
        {includes.length > 0 && (
          <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <p className="text-sm font-bold text-foreground">{perkTitle}</p>
            </div>
            <ul className="space-y-1.5">
              {includes.map((inc, i) => {
                const Icon =
                  inc.available === "no" ? X : inc.available === "optional" ? Plus : Check;
                const iconColor =
                  inc.available === "no"
                    ? "hsl(var(--destructive))"
                    : inc.available === "optional"
                      ? "hsl(25, 70%, 45%)"
                      : "hsl(var(--primary))";
                const textCls =
                  inc.available === "no"
                    ? "text-muted-foreground line-through"
                    : "text-foreground";
                return (
                  <li key={i} className="flex items-start gap-1.5">
                    <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: iconColor }} />
                    <span className={`text-xs leading-snug ${textCls}`}>
                      {inc.text}
                      {inc.price_note && (
                        <span className="text-muted-foreground ml-1">（{inc.price_note}）</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* 費用明細：房費 + 加購 */}
        {((roomSubtotal && roomSubtotal > 0) || (addonLines && addonLines.length > 0)) && (
          <div className="border-t border-border px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-bold tracking-[0.18em] text-muted-foreground/80">
              PRICE BREAKDOWN
            </p>
            {roomSubtotal != null && roomSubtotal > 0 && (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 text-foreground break-words">
                  房費（{nights} 晚）
                  {roomOriginalSubtotal != null && roomOriginalSubtotal > roomSubtotal && (
                    <SavingsBadge
                      original={roomOriginalSubtotal}
                      price={roomSubtotal}
                      className="ml-1.5"
                    />
                  )}
                </span>
                <span className="shrink-0 whitespace-nowrap font-semibold text-foreground tabular-nums">
                  {roomOriginalSubtotal != null && roomOriginalSubtotal > roomSubtotal && (
                    <OriginalPrice amount={roomOriginalSubtotal} className="mr-1.5" />
                  )}
                  NT$ {roomSubtotal.toLocaleString()}
                </span>
              </div>

            )}

            {addonLines?.map((line, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 text-foreground break-words">
                  {line.label}
                  <span className="text-muted-foreground ml-1">（{line.qty}）</span>
                </span>
                <span className="shrink-0 whitespace-nowrap font-semibold text-foreground tabular-nums">
                  NT$ {line.subtotal.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 折扣 */}
        {appliedDiscount && discount > 0 && (
          <div className="border-t border-border px-4 py-2.5">
            <div className="inline-flex items-center gap-1.5 text-xs text-destructive bg-primary/10 border border-primary/20 rounded-md px-2 py-1">
              <Tag className="h-3 w-3" />
              <span>
                已套用 {appliedDiscount.code}
                {appliedDiscount.type === "percentage" && appliedDiscount.value
                  ? ` 折扣原價${appliedDiscount.value}%`
                  : ""}
                ，折抵 NT$ {discount.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* 總金額 */}
        {finalTotal > 0 && (
          <div className="border-t border-border px-4 py-3 flex items-baseline justify-between bg-muted/30">
            <span className="text-sm text-muted-foreground">總金額</span>
            <span className="text-xl font-bold text-primary">
              NT$ {finalTotal.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
