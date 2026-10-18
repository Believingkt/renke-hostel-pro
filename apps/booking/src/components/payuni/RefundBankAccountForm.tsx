import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { useBookingLocale } from "@lakeze/shared/contexts/BookingLocaleContext";

export interface RefundBankAccount {
  bank_code: string;
  bank_sub_code: string;
  account_no: string;
  holder_name: string;
  uid: string;
}

export const EMPTY_REFUND_BANK_ACCOUNT: RefundBankAccount = { bank_code: "", bank_sub_code: "", account_no: "", holder_name: "", uid: "" };

/** 與後端 validateBankAccount 同規則（後端仍會再驗） */
export const isRefundBankAccountValid = (a: RefundBankAccount) =>
  /^\d{3}$/.test(a.bank_code) && (!a.bank_sub_code || /^\d{4}$/.test(a.bank_sub_code)) &&
  /^\d{6,16}$/.test(a.account_no.replace(/[\s-]/g, "")) && a.holder_name.trim().length > 0 &&
  (/^[A-Z][12]\d{8}$/.test(a.uid.trim().toUpperCase()) || /^\d{8}$/.test(a.uid.trim()));

const FIELDS: Array<{ key: keyof RefundBankAccount; label: string; mode?: "numeric" }> = [
  { key: "bank_code", label: "booking.member.payuniRefund.bankCode", mode: "numeric" },
  { key: "bank_sub_code", label: "booking.member.payuniRefund.branchCode", mode: "numeric" },
  { key: "account_no", label: "booking.member.payuniRefund.accountNo", mode: "numeric" },
  { key: "holder_name", label: "booking.member.payuniRefund.holderName" },
  { key: "uid", label: "booking.member.payuniRefund.uid" },
];

/** PAYUNi ATM 退款帳戶表單（會員取消、補填、後台／總部代填共用） */
export function RefundBankAccountForm({ value, onChange, testIdPrefix }: {
  value: RefundBankAccount; onChange: (v: RefundBankAccount) => void; testIdPrefix: string;
}) {
  const { t } = useBookingLocale();
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid={`${testIdPrefix}-form`}>
      <div className="text-sm font-medium">{t("booking.member.payuniRefund.bankTitle")}</div>
      <p className="text-xs text-muted-foreground">{t("booking.member.payuniRefund.bankHint")}</p>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.key === "account_no" || f.key === "uid" ? "col-span-2 space-y-1" : "space-y-1"}>
            <Label htmlFor={`${testIdPrefix}-${f.key}`} className="text-xs">{t(f.label)}</Label>
            <Input id={`${testIdPrefix}-${f.key}`} data-testid={`${testIdPrefix}-${f.key}`} inputMode={f.mode} autoComplete="off"
              value={value[f.key]} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );
}
