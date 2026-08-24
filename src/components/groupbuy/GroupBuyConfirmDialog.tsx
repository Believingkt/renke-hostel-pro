import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import FraudPreventionNotice from "@/components/common/FraudPreventionNotice";
import TermsConsentText from "@/components/common/TermsConsentText";


export type GroupBuyPaymentMethod = "bank" | "atm" | "credit_card";

const twd = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  submitting: boolean;
  onConfirm: () => void;
  venueName: string;
  packageName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomQuantity: number;
  guestSummary: string;
  baseTotal: number;
  childExtraTotal: number;
  total: number;
  deposit: number;
  balance: number;
  depositPct: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  /** 活動是否開放銀行匯款（人工對帳，訂金制） */
  bankTransferEnabled?: boolean;
  /** 活動是否開放 ATM 虛擬帳號；false 時完全維持既有人工匯款流程 */
  atmEnabled?: boolean;
  /** 活動是否開放信用卡（付款成功後才建立訂單） */
  creditCardEnabled?: boolean;
  paymentMethod?: GroupBuyPaymentMethod;
  onPaymentMethodChange?: (v: GroupBuyPaymentMethod) => void;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`text-right tabular-nums ${strong ? "font-semibold text-foreground" : ""}`}>{value}</span>
    </div>
  );
}

/** 送出前的確認層：僅確認內容，實際建單仍沿用原本的 onConfirm 流程 */
export function GroupBuyConfirmDialog(props: Props) {
  const {
    open, onOpenChange, submitting, onConfirm, venueName, packageName,
    checkIn, checkOut, nights, roomQuantity, guestSummary, baseTotal, childExtraTotal,
    total, deposit, balance, depositPct, guestName, guestPhone, guestEmail,
    bankTransferEnabled = true, atmEnabled = false, creditCardEnabled = false,
    paymentMethod = "bank", onPaymentMethodChange,
  } = props;
  const options = [
    { key: "bank" as const, title: "銀行匯款（人工對帳）", desc: "匯款後於訂單頁回報，由民宿確認入帳。", on: bankTransferEnabled },
    { key: "atm" as const, title: "ATM 虛擬帳號", desc: "系統開立專屬帳號，入帳後自動確認訂單。", on: atmEnabled },
    {
      key: "credit_card" as const,
      title: "信用卡（3D 驗證）",
      desc: "線上全額付款，付款成功後才建立訂單，期間為您保留 10 分鐘房位。",
      on: creditCardEnabled,
    },
  ].filter((o) => o.on);
  const method: GroupBuyPaymentMethod = options.some((o) => o.key === paymentMethod) ? paymentMethod : "bank";

  return (
    <Dialog open={open} onOpenChange={(v) => (!submitting ? onOpenChange(v) : null)}>
      <DialogContent className="gb-theme max-h-[88vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">確認您的預訂</DialogTitle>
          <DialogDescription>請再次確認以下內容，確認後才會建立訂單並取得匯款資訊。</DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl bg-muted/70 p-4">
          <Row label="民宿" value={venueName} strong />
          <Row label="方案" value={packageName} />
          <Row label="入住" value={checkIn} />
          <Row label="退房" value={checkOut} />
          <Row label="住宿" value={`${nights} 晚 × ${roomQuantity} 間`} />
          <Row label="入住人數" value={guestSummary} />
          <Separator className="my-2.5 bg-border/70" />
          <Row label="方案房費" value={twd(baseTotal)} />
          {childExtraTotal > 0 && <Row label="兒童加價" value={twd(childExtraTotal)} />}
          <Row label="方案總額" value={twd(total)} strong />
          {method === "credit_card" ? (
            <>
              <div className="flex items-baseline justify-between py-1">
                <span className="text-sm font-semibold text-foreground">本次線上全額付款</span>
                <span className="text-xl font-bold tabular-nums text-accent">{twd(total)}</span>
              </div>
              <p className="text-xs text-muted-foreground">信用卡為全額付款，入住當天不需再支付尾款。</p>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between py-1">
                <span className="text-sm font-semibold text-foreground">本次應付訂金（{depositPct}%）</span>
                <span className="text-xl font-bold tabular-nums text-accent">{twd(deposit)}</span>
              </div>
              <Row label="入住支付尾款" value={twd(balance)} />
            </>
          )}
        </div>


        <div className="rounded-2xl border border-border/70 p-4">
          <Row label="訂房人" value={guestName} strong />
          <Row label="聯絡電話" value={guestPhone} />
          <Row label="Email" value={guestEmail} />
        </div>

        {options.length > 1 && (
          <div className="rounded-2xl border border-border/70 p-4">
            <p className="mb-2 text-sm font-semibold text-foreground">付款方式</p>
            <div className="grid gap-2">
              {options.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  disabled={submitting}
                  onClick={() => onPaymentMethodChange?.(opt.key)}
                  className={`rounded-xl border p-3 text-left transition ${
                    method === opt.key ? "border-accent bg-accent/10" : "border-border/70 hover:bg-muted/60"
                  }`}
                >
                  <span className="block text-sm font-medium text-foreground">{opt.title}</span>
                  <span className="block text-xs text-muted-foreground">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <FraudPreventionNotice variant="bank_transfer" />

        <TermsConsentText variant="group_buy" />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl sm:h-11"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            返回修改
          </Button>
          <Button
            type="button"
            className="h-12 rounded-xl bg-accent px-5 text-base font-semibold text-accent-foreground hover:bg-accent/90 sm:h-11"
            disabled={submitting}
            onClick={onConfirm}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {method === "credit_card"
              ? "前往信用卡付款"
              : method === "atm"
              ? "確認訂房並取得虛擬帳號"
              : "確認訂房並取得匯款資訊"}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}

export default GroupBuyConfirmDialog;
