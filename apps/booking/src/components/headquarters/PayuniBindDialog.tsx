import { useMemo, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { parseFunctionInvokeError } from "@lakeze/shared/utils/parseFunctionError";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { Textarea } from "@lakeze/shared/components/ui/textarea";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@lakeze/shared/components/ui/dialog";
import { Loader2 } from "lucide-react";
import {
  buildMerUrl, defaultMerDesc, PAYUNI_DEFAULT_MCC, validateBindForm, type PayuniBindForm,
} from "@/lib/payuniMerchantRules";

export interface PayuniBindAccommodation {
  id: string;
  name: string;
  short_url_alias: string | null;
  address: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
}

const PAYMENT_OPTIONS = ["CREDIT", "ForeignCard", "ATM", "ApplePay", "GooglePay"];

type FieldDef = { key: keyof PayuniBindForm; label: string; required?: boolean; hint?: string; multiline?: boolean };
const FIELDS: FieldDef[] = [
  { key: "legal_name", label: "登記名稱（公司或負責人姓名）", required: true },
  { key: "ubn", label: "統一編號／身分證字號", required: true },
  { key: "member_email", label: "PAYUNi 會員 Email", required: true, hint: "PAYUNi 會寄驗證信到這個信箱" },
  { key: "mbc_name", label: "負責人姓名（選填）" },
  { key: "mbc_tel", label: "負責人電話（選填）" },
  { key: "mbc_mail", label: "負責人 Email（選填）" },
  { key: "mc_name", label: "實際負責人姓名（選填）" },
  { key: "mcid", label: "實際負責人身分證字號（選填）", hint: "僅用於送件，不會保存" },
  { key: "contact_name", label: "聯絡人", required: true },
  { key: "contact_tel", label: "聯絡電話", hint: "格式 02-9888888#123；電話與手機至少填一個" },
  { key: "contact_mobile", label: "聯絡手機", hint: "格式 0912345678" },
  { key: "mer_email", label: "商店客服 Email", required: true },
  { key: "mer_name", label: "商店名稱（20 字內）", required: true },
  { key: "mer_eng_name", label: "商店英文名稱（50 字內）", required: true },
  { key: "mer_addr", label: "商店地址", required: true },
  { key: "mer_addr_post", label: "郵遞區號（3 碼）", required: true },
  { key: "mer_tel", label: "商店電話（選填）" },
  { key: "mer_desc", label: "商店簡介", required: true, multiline: true },
  { key: "mer_mcc", label: "MCC 行業代碼", required: true, hint: "必填，請確認代碼（預設值 000 為暫存）" },
  { key: "goods_rate", label: "商品比例（4 個數字，總和 100）", required: true },
  { key: "deliver_time", label: "出貨天數", required: true },
  { key: "escrow_type", label: "履約保證（0 或 1）", required: true },
  { key: "mer_unit_price", label: "平均客單價（整數）", required: true },
];

export function buildDefaultBindForm(acc: PayuniBindAccommodation): PayuniBindForm {
  const addr = (acc.address ?? "").trim();
  const phone = (acc.phone ?? "").trim();
  return {
    legal_name: "", ubn: "", member_email: "", mbc_name: "", mbc_tel: "", mbc_mail: "", mc_name: "", mcid: "",
    contact_name: "",
    contact_tel: /^09\d{8}$/.test(phone) ? "" : phone,
    contact_mobile: /^09\d{8}$/.test(phone) ? phone : "",
    mer_email: acc.email ?? "", mer_name: acc.name ?? "", mer_eng_name: "",
    mer_addr: addr.replace(/^\d{3,6}\s*/, ""), mer_addr_post: /^\d{3}/.exec(addr)?.[0] ?? "", mer_tel: "",
    mer_desc: defaultMerDesc(acc.description), mer_mcc: PAYUNI_DEFAULT_MCC, goods_rate: "0,100,0,0",
    payment: ["CREDIT", "ForeignCard", "ATM"], deliver_time: "1", escrow_type: "0", mer_unit_price: "",
  };
}

export function PayuniBindDialog({ accommodation, open, onOpenChange, onDone }: {
  accommodation: PayuniBindAccommodation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<PayuniBindForm>(() => buildDefaultBindForm(accommodation));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const merUrl = useMemo(() => buildMerUrl(accommodation.short_url_alias), [accommodation.short_url_alias]);
  const payment = Array.isArray(form.payment) ? form.payment : [];

  const set = (k: keyof PayuniBindForm, v: string | string[]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const errs = validateBindForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("payuni-merchant-bind", {
        body: { accommodation_id: accommodation.id, form },
      });
      if (error) {
        const parsed = await parseFunctionInvokeError(error);
        setResult({ ok: false, text: parsed.message });
        return;
      }
      if (data?.ok) {
        setResult({ ok: true, text: `建店成功，商店代號 ${data.mer_id}。PAYUNi 將寄驗證信到 ${form.member_email}，請通知民宿 60 分鐘內完成驗證。` });
        onDone();
      } else {
        setResult({ ok: false, text: `PAYUNi 回覆失敗：${data?.status ?? ""} ${data?.message ?? ""}`.trim() });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="payuni-bind-dialog">
        <DialogHeader>
          <DialogTitle>PAYUNi 建店：{accommodation.name}</DialogTitle>
          <DialogDescription>商店網址固定為 {merUrl}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((fd) => (
            <div key={fd.key} className={fd.multiline ? "sm:col-span-2 space-y-1" : "space-y-1"}>
              <Label htmlFor={`payuni-${fd.key}`}>
                {fd.label}{fd.required && <span className="text-destructive"> *</span>}
              </Label>
              {fd.multiline ? (
                <Textarea id={`payuni-${fd.key}`} data-testid={`payuni-bind-${fd.key}`} rows={3}
                  value={String(form[fd.key] ?? "")} onChange={(e) => set(fd.key, e.target.value)} />
              ) : (
                <Input id={`payuni-${fd.key}`} data-testid={`payuni-bind-${fd.key}`}
                  value={String(form[fd.key] ?? "")} onChange={(e) => set(fd.key, e.target.value)} />
              )}
              {fd.hint && <p className="text-xs text-muted-foreground">{fd.hint}</p>}
              {errors[fd.key] && <p className="text-xs text-destructive" data-testid={`payuni-bind-error-${fd.key}`}>{errors[fd.key]}</p>}
            </div>
          ))}
          <div className="sm:col-span-2 space-y-1">
            <Label>支付工具 <span className="text-destructive">*</span></Label>
            <div className="flex flex-wrap gap-4">
              {PAYMENT_OPTIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <Checkbox data-testid={`payuni-bind-payment-${p}`} checked={payment.includes(p)}
                    onCheckedChange={(c) => set("payment", c ? [...payment, p] : payment.filter((x) => x !== p))} />
                  {p}
                </label>
              ))}
            </div>
            {errors.payment && <p className="text-xs text-destructive" data-testid="payuni-bind-error-payment">{errors.payment}</p>}
          </div>
        </div>
        {result && (
          <p role="status" data-testid="payuni-bind-result"
            className={result.ok ? "rounded-md bg-green-50 p-3 text-sm text-green-800" : "rounded-md bg-destructive/10 p-3 text-sm text-destructive"}>
            {result.text}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="payuni-bind-cancel">關閉</Button>
          <Button onClick={submit} disabled={submitting || result?.ok === true} data-testid="payuni-bind-submit">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}送出建店
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
