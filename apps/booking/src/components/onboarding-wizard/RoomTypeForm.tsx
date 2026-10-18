import { useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { toast } from "sonner";
import { wizardApi } from "@/lib/onboarding/wizardApi";
import type { WizardRoomType } from "@/hooks/use-wizard-data";

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
    <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-5 sm:items-end" data-testid={`room-type-form-${key}`}>
      <div className="space-y-1 sm:col-span-2">
        <Label>房型名稱</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={locked} data-testid={`room-type-name-${key}`} />
      </div>
      <div className="space-y-1">
        <Label>人數</Label>
        <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} disabled={locked} data-testid={`room-type-capacity-${key}`} />
      </div>
      <div className="space-y-1">
        <Label>房價（元）</Label>
        <Input type="number" min={1} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} disabled={locked} data-testid={`room-type-price-${key}`} />
      </div>
      <div className="space-y-1">
        <Label>房間數{singleUnit && "（包棟固定 1）"}</Label>
        <Input type="number" min={1} value={roomCount} onChange={(e) => setRoomCount(e.target.value)} disabled={locked || singleUnit} data-testid={`room-type-count-${key}`} />
      </div>
      {!locked && (
        <Button className="sm:col-span-5 sm:w-fit" onClick={save} disabled={saving} data-testid={`room-type-save-${key}`}>
          {roomType ? "儲存房型" : "新增房型"}
        </Button>
      )}
    </div>
  );
}
