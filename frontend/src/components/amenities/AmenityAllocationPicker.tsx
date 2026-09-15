import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PackageOpen } from "lucide-react";
import {
  fetchAmenityAvailability,
  type AmenityAvailability,
} from "@/lib/amenityAllocation";

interface Props {
  accommodationId: string;
  checkIn?: string | null;
  checkOut?: string | null;
  /** 編輯既有訂單時排除自己已佔用的數量 */
  excludeOrderId?: string | null;
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  disabled?: boolean;
}

/**
 * 備品分配挑選器：以「住宿夜次」為單位計算每日剩餘，
 * 顯示的可用數量為整段期間內任一晚的最小剩餘。
 */
export function AmenityAllocationPicker({
  accommodationId,
  checkIn,
  checkOut,
  excludeOrderId,
  value,
  onChange,
  disabled,
}: Props) {
  const [rows, setRows] = useState<AmenityAvailability[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!accommodationId || !checkIn || !checkOut) {
      setRows([]);
      return;
    }
    setLoading(true);
    fetchAmenityAvailability({
      accommodationId,
      checkIn,
      checkOut,
      excludeOrderId: excludeOrderId ?? null,
    })
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accommodationId, checkIn, checkOut, excludeOrderId]);

  if (loading || rows.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <PackageOpen className="h-4 w-4" />
        備品分配
        <span className="text-xs text-muted-foreground font-normal">
          （依住宿夜次佔用，額滿即無法再分配）
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ item, available }) => {
          const current = value[item.id] ?? 0;
          const max = available;
          return (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <Label className="text-sm">{item.name}</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={max > 0 ? "secondary" : "destructive"} className="text-xs">
                    可用 {max} / 共 {item.total_quantity}
                    {item.unit ? ` ${item.unit}` : ""}
                  </Badge>
                </div>
                {item.notes && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{item.notes}</p>
                )}
              </div>
              <Input
                type="number"
                min={0}
                max={max}
                inputMode="numeric"
                className="w-20 text-base"
                disabled={disabled || (max <= 0 && current <= 0)}
                value={current === 0 ? "" : current}
                placeholder="0"
                onChange={(e) => {
                  const raw = parseInt(e.target.value, 10);
                  const qty = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(max, raw));
                  onChange({ ...value, [item.id]: qty });
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AmenityAllocationPicker;
