import { useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Textarea } from "@lakeze/shared/components/ui/textarea";
import { PreloadLink } from "@lakeze/shared/components/PreloadLink";
import { useAliasPrefix } from "@lakeze/shared/hooks/use-alias-prefix";
import { toast } from "sonner";
import { wizardApi } from "@/lib/onboarding/wizardApi";
import { BASIC_RULES, basicInfoErrors, type BasicInfo } from "@/lib/onboarding/basicInfo";
import type { WizardBasicInfo } from "@/hooks/use-wizard-data";
import { WizardField } from "./WizardField";

interface Props { accommodationId: string; info: WizardBasicInfo; locked: boolean; onSaved: () => void }

/** 第 1 步：開賣前檢查要求的基本資料；PMS 代號只顯示 */
export function BasicInfoStep({ accommodationId, info, locked, onSaved }: Props) {
  const { withPrefix } = useAliasPrefix();
  const [form, setForm] = useState<BasicInfo>({ name: info.name ?? "", address: info.address ?? "", phone: info.phone ?? "", description: info.description ?? "" });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = basicInfoErrors(form);
  const show = (k: keyof BasicInfo) => (touched ? errors[k] : null);
  const set = (k: keyof BasicInfo) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const descLen = Array.from(form.description.trim()).length;

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length > 0) { toast.error("基本資料有欄位需要修正"); return; }
    setSaving(true);
    try {
      await wizardApi.saveBasicInfo({ accommodationId, ...form });
      toast.success("基本資料已儲存");
      onSaved();
    } catch (e) {
      toast.error(`儲存失敗：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="basic-info-step">
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <WizardField label="民宿名稱" htmlFor="bi-name" hint={`旅客在訂房頁看到的名稱，${BASIC_RULES.name.min}～${BASIC_RULES.name.max} 字。`} error={show("name")}>
          <Input id="bi-name" value={form.name} onChange={set("name")} disabled={locked} placeholder="例：礁溪山嵐包棟民宿" data-testid="basic-info-name" />
        </WizardField>
        <WizardField label="PMS 代號" hint="系統網址代號，由總部建立，不能修改。">
          <Input value={info.short_url_alias ?? "（尚未設定，請聯絡總部）"} disabled readOnly data-testid="basic-info-alias" />
        </WizardField>
        <WizardField label="電話" htmlFor="bi-phone" hint="旅客聯絡用。可用數字、空白、-、+、()，分機用 #，例：03-987-6543、0912-345-678、02-2345-6789#12。" error={show("phone")}>
          <Input id="bi-phone" type="tel" value={form.phone} onChange={set("phone")} disabled={locked} placeholder="例：03-987-6543" data-testid="basic-info-phone" />
        </WizardField>
        <WizardField label="地址" htmlFor="bi-address" hint="完整地址，會顯示在訂房頁與訂單確認信。" error={show("address")}>
          <Input id="bi-address" value={form.address} onChange={set("address")} disabled={locked} placeholder="例：宜蘭縣礁溪鄉溫泉路 1 號" data-testid="basic-info-address" />
        </WizardField>
        <WizardField className="md:col-span-2" label="民宿介紹" htmlFor="bi-desc" error={show("description")}
          hint={`顯示在官網「關於我們」與訂房頁，至少 ${BASIC_RULES.description.min} 字（目前 ${descLen} 字）。可寫環境特色、適合的客群、周邊景點。`}>
          <Textarea id="bi-desc" rows={6} value={form.description} onChange={set("description")} disabled={locked} placeholder="例：位於礁溪溫泉區的獨棟包棟民宿，三間房最多可住 10 人，附私人湯池與烤肉區，步行 5 分鐘到湯圍溝公園。" data-testid="basic-info-description" />
        </WizardField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          照片、入住與退房時間等其他資訊不在精靈內，
          <PreloadLink to={withPrefix("/admin/website-content?tab=basic-info")} className="underline" data-testid="basic-info-settings-link">前往一般設定頁</PreloadLink>
          填寫。
        </p>
        {!locked && <Button onClick={save} disabled={saving} data-testid="basic-info-save-btn">儲存基本資料</Button>}
      </div>
    </div>
  );
}
