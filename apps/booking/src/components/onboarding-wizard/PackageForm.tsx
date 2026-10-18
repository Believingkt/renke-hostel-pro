import { useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { toast } from "sonner";
import { TIER_LABELS, tierPriceError, wizardApi, type SavePackageResult, type TierKey, type TierPrices } from "@/lib/onboarding/wizardApi";
import type { WizardPackage, WizardRoomType } from "@/hooks/use-wizard-data";

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
    <div className="space-y-3 rounded-md border p-4" data-testid={`package-form-${key}`}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>方案名稱</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={locked} data-testid={`package-name-${key}`} />
        </div>
        <div className="space-y-1">
          <Label>主房型</Label>
          <Select value={roomTypeId} onValueChange={setRoomTypeId} disabled={locked || !!fixedRoomType}>
            <SelectTrigger data-testid={`package-room-type-${key}`}><SelectValue placeholder="選擇房型" /></SelectTrigger>
            <SelectContent>
              {roomTypes.map((rt) => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>入住人數</Label>
          <Input type="number" min={1} value={guests} onChange={(e) => setGuests(e.target.value)} disabled={locked} data-testid={`package-guests-${key}`} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {TIERS.map((t) => (
          <div key={t} className="space-y-1 rounded-md bg-muted/40 p-3">
            <p className="text-sm font-medium">{TIER_LABELS[t]}（必填）</p>
            {(["sale", "original"] as const).map((f) => (
              <div key={f} className="flex items-center gap-2">
                <Label className="w-10 shrink-0 text-xs">{f === "sale" ? "售價" : "原價"}</Label>
                <Input type="number" min={1} value={prices[`${t}.${f}`]} disabled={locked}
                  onChange={(e) => setPrices((p) => ({ ...p, [`${t}.${f}`]: e.target.value }))}
                  data-testid={`package-${t}-${f}-${key}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {!locked && <Button onClick={save} disabled={saving} data-testid={`package-save-${key}`}>{pkg ? "儲存方案" : "新增方案"}</Button>}
    </div>
  );
}
