import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AmenityAllocationPicker } from "@/components/amenities/AmenityAllocationPicker";
import { fetchOrderAllocations, saveOrderAllocations } from "@/lib/amenityAllocation";

interface Props {
  orderId: string;
  accommodationId: string;
  checkIn: string;
  checkOut: string;
  readOnly?: boolean;
}

/** 訂單詳情內的備品分配卡片 */
export function OrderAmenityCard({ orderId, accommodationId, checkIn, checkOut, readOnly }: Props) {
  const [value, setValue] = useState<Record<string, number>>({});
  const [initial, setInitial] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!orderId) return;
    fetchOrderAllocations(orderId)
      .then((map) => {
        setValue(map);
        setInitial(map);
      })
      .catch(() => undefined);
  }, [orderId, version]);

  const dirty = JSON.stringify(
    Object.fromEntries(Object.entries(value).filter(([, q]) => q > 0)),
  ) !== JSON.stringify(Object.fromEntries(Object.entries(initial).filter(([, q]) => q > 0)));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveOrderAllocations({ orderId, accommodationId, allocations: value });
      toast.success("備品分配已更新");
      setVersion((v) => v + 1);
    } catch (e: any) {
      toast.error("儲存失敗", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (!accommodationId || !checkIn || !checkOut) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">備品分配</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AmenityAllocationPicker
          key={version}
          accommodationId={accommodationId}
          checkIn={checkIn}
          checkOut={checkOut}
          excludeOrderId={orderId}
          value={value}
          onChange={setValue}
          disabled={readOnly}
        />
        {!readOnly && (
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              儲存備品分配
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OrderAmenityCard;
