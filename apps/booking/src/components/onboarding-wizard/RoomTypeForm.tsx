import { useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { toast } from "sonner";
import { wizardApi } from "@/lib/onboarding/wizardApi";
import type { WizardRoomType } from "@/hooks/use-wizard-data";
import { WizardField } from "./WizardField";

interface Props {
  accommodationId: string;
  roomType?: WizardRoomType;
  singleUnit: boolean;
  locked: boolean;
  onSaved: () => void;
}

/** 房型表單：單棟包棟固定房間數 1 */
export function RoomTypeForm({ accommodationId, roomType, singleUnit, locked, onSaved }: Props) {
  const [name, setName] = useState(roomType?.name ?? "");
  const [capacity, setCapacity] = useState(String(roomType?.capacity ?? ""));
  const [basePrice, setBasePrice] = useState(String(roomType?.base_price ?? ""));
  const [roomCount, setRoomCount] = useState(String(singleUnit ? 1 : roomType?.room_count ?? ""));
  const [saving, setSaving] = useState(false);
  const key = roomType?.id ?? "new";
  const id = (f: string) => `rt-${f}-${key}`;

  const save = async () => {
    const n = { capacity: Number(capacity), basePrice: Number(basePrice), roomCount: singleUnit ? 1 : Number(roomCount) };
    if (!name.trim() || !(n.capacity > 0 && n.basePrice > 0 && n.roomCount > 0)) {
      toast.error("房型名稱必填，人數、房價、房間數都必須大於 0");
      return;
    }
    setSaving(true);
    try {
      await wizardApi.saveRoomType({ accommodationId, roomTypeId: roomType?.id ?? null, name: name.trim(), ...n });
      toast.success("房型已儲存");
      if (!roomType) { setName(""); setCapacity(""); setBasePrice(""); setRoomCount(singleUnit ? "1" : ""); }
      onSaved();
    } catch (e) {
      toast.error(`儲存失敗：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 rounded-lg border p-5 sm:p-6" data-testid={`room-type-form-${key}`}>
      {!roomType && <p className="text-sm font-medium">新增房型</p>}
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
        <WizardField label="房型名稱" htmlFor={id("name")} hint="旅客會看到的名稱，例「整棟包棟」「四人家庭房」。">
          <Input id={id("name")} value={name} onChange={(e) => setName(e.target.value)} disabled={locked} placeholder="例：整棟包棟" data-testid={`room-type-name-${key}`} />
        </WizardField>
        <WizardField label="最多入住人數" htmlFor={id("cap")} hint="這個房型最多可以住幾位（訂房頁顯示「X 人」，也是團購分房的人數上限）。方案的入住人數另外在「方案」步驟設定。">
          <Input id={id("cap")} type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} disabled={locked} placeholder="例：8" data-testid={`room-type-capacity-${key}`} />
        </WizardField>
        <WizardField label="預設房價（元／晚）" htmlFor={id("price")} hint="開庫存時寫入每天的預設房價。旅客訂方案時，實際收費以方案的三日型售價為準。">
          <Input id={id("price")} type="number" min={1} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} disabled={locked} placeholder="例：8000" data-testid={`room-type-price-${key}`} />
        </WizardField>
        <WizardField label="房間數" htmlFor={id("count")} hint={singleUnit ? "單棟包棟固定 1 間（整棟一起賣）。" : "這個房型每天可賣幾間，開庫存時用來設定每天的可訂間數。"}>
          <Input id={id("count")} type="number" min={1} value={roomCount} onChange={(e) => setRoomCount(e.target.value)} disabled={locked || singleUnit} placeholder="例：3" data-testid={`room-type-count-${key}`} />
        </WizardField>
      </div>
      {!locked && (
        <Button onClick={save} disabled={saving} data-testid={`room-type-save-${key}`}>
          {roomType ? "儲存房型" : "新增房型"}
        </Button>
      )}
    </div>
  );
}
