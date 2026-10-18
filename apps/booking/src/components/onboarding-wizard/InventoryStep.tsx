import { useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { toast } from "sonner";
import { addMonths, taipeiToday, wizardApi, type InventoryResult } from "@/lib/onboarding/wizardApi";
import type { WizardRoomType } from "@/hooks/use-wizard-data";

/** 開庫存：預設今天起 6 個月；間數 = 房型房間數、價格 = 房型房價；只新增沒有的日期 */
export function InventoryStep({ accommodationId, roomTypes, locked, onDone }: { accommodationId: string; roomTypes: WizardRoomType[]; locked: boolean; onDone: () => void }) {
  const [start, setStart] = useState(taipeiToday());
  const [end, setEnd] = useState(addMonths(taipeiToday(), 6));
  const [result, setResult] = useState<InventoryResult | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const r = await wizardApi.openInventory(accommodationId, start, end);
      setResult(r);
      toast.success("庫存已開啟");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="inventory-step">
      <ul className="text-sm text-muted-foreground">
        {roomTypes.map((rt) => <li key={rt.id}>{rt.name}：每天 {rt.room_count ?? 0} 間、{rt.base_price} 元</li>)}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label>開始日</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={locked} data-testid="inventory-start" /></div>
        <div className="space-y-1"><Label>結束日</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} disabled={locked} data-testid="inventory-end" /></div>
        {!locked && <Button onClick={open} disabled={busy || roomTypes.length === 0} data-testid="inventory-open-btn">開啟庫存</Button>}
      </div>
      <p className="text-xs text-muted-foreground">已經有庫存的日期會略過，不會覆蓋。</p>
      {result && (
        <ul className="text-sm" data-testid="inventory-result">
          {result.room_types.map((r) => <li key={r.room_type_id}>{r.name}：新增 {r.inserted} 天、略過 {r.skipped} 天（已有資料）</li>)}
        </ul>
      )}
    </div>
  );
}
