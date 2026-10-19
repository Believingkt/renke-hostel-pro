import { useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { toast } from "sonner";
import { TIER_HINTS, TIER_LABELS, tierPriceError, wizardApi, type SavePackageResult, type TierKey, type TierPrices } from "@/lib/onboarding/wizardApi";
import type { WizardPackage, WizardRoomType } from "@/hooks/use-wizard-data";
import { WizardField } from "./WizardField";

interface Props {
  accommodationId: string;
  pkg?: WizardPackage;
  roomTypes: WizardRoomType[];
  /** 單棟包棟：固定主房型，名稱預填「包棟＋房型名稱」（可修改） */
  fixedRoomType?: WizardRoomType;
  locked: boolean;
  onSaved: (r: SavePackageResult) => void;
}

const TIERS = Object.keys(TIER_LABELS) as TierKey[];

export function PackageForm({ accommodationId, pkg, roomTypes, fixedRoomType, locked, onSaved }: Props) {
  const key = pkg?.id ?? "new";
  const id = (f: string) => `pkg-${f}-${key}`;
  const [name, setName] = useState(pkg?.name ?? (fixedRoomType ? `包棟${fixedRoomType.name}` : ""));
  const [roomTypeId, setRoomTypeId] = useState(pkg?.primary_room_type_id ?? fixedRoomType?.id ?? "");
  const [guests, setGuests] = useState(String(pkg?.guest_count ?? fixedRoomType?.capacity ?? ""));
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(TIERS.flatMap((t) => [[`${t}.sale`, String(pkg?.tier_prices?.[t]?.sale ?? "")], [`${t}.original`, String(pkg?.tier_prices?.[t]?.original ?? "")]])),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const tier = Object.fromEntries(TIERS.map((t) => [t, { sale: Number(prices[`${t}.sale`] || 0), original: Number(prices[`${t}.original`] || 0) }])) as TierPrices;
    const err = !name.trim() ? "方案名稱必填" : !roomTypeId ? "請選擇主房型" : !(Number(guests) > 0) ? "入住人數必須大於 0" : tierPriceError(tier);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const r = await wizardApi.savePackage({ accommodationId, packageId: pkg?.id ?? null, name: name.trim(), primaryRoomTypeId: roomTypeId, guestCount: Number(guests), tierPrices: tier });
      toast.success("方案已儲存");
      onSaved(r);
    } catch (e) {
      toast.error(`儲存失敗：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 rounded-lg border p-5 sm:p-6" data-testid={`package-form-${key}`}>
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <WizardField label="方案名稱" htmlFor={id("name")} hint="旅客選購時看到的名稱，例「包棟・含早餐」「平日不含餐」。">
          <Input id={id("name")} value={name} onChange={(e) => setName(e.target.value)} disabled={locked} placeholder="例：包棟・含早餐" data-testid={`package-name-${key}`} />
        </WizardField>
        <WizardField label="主房型" hint={fixedRoomType ? "單棟包棟固定使用唯一的房型。" : "這個方案賣的是哪個房型；系統會自動建立對應的專案。"}>
          <Select value={roomTypeId} onValueChange={setRoomTypeId} disabled={locked || !!fixedRoomType}>
            <SelectTrigger data-testid={`package-room-type-${key}`}><SelectValue placeholder="選擇房型" /></SelectTrigger>
            <SelectContent>
              {roomTypes.map((rt) => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </WizardField>
        <WizardField label="入住人數" htmlFor={id("guests")} hint="這個方案的價格對應幾位入住；旅客選這個人數時套用此方案。">
          <Input id={id("guests")} type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} disabled={locked} placeholder="例：8" data-testid={`package-guests-${key}`} />
        </WizardField>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">三日型價格（每晚，三種都必填）</p>
          <p className="text-xs leading-relaxed text-muted-foreground">依入住當晚的日期決定用哪一種價格。原價 = 劃線價（顯示用），售價 = 實收價（旅客實際付款）；原價不得低於售價。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t} className="space-y-3 rounded-lg bg-muted/40 p-4">
              <div>
                <p className="text-sm font-medium">{TIER_LABELS[t]}</p>
                <p className="text-xs text-muted-foreground">{TIER_HINTS[t]}</p>
              </div>
              {(["sale", "original"] as const).map((f) => (
                <div key={f} className="space-y-1.5">
                  <Label htmlFor={id(`${t}-${f}`)} className="text-xs">{f === "sale" ? "售價（實收）" : "原價（劃線）"}</Label>
                  <Input id={id(`${t}-${f}`)} type="number" min={1} value={prices[`${t}.${f}`]} disabled={locked} placeholder={f === "sale" ? "例：8000" : "例：9000"}
                    onChange={(e) => setPrices((p) => ({ ...p, [`${t}.${f}`]: e.target.value }))}
                    data-testid={`package-${t}-${f}-${key}`} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {!locked && <Button onClick={save} disabled={saving} data-testid={`package-save-${key}`}>{pkg ? "儲存方案" : "新增方案"}</Button>}
    </div>
  );
}
