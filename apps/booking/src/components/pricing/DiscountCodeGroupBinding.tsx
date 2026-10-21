import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { useAccommodationPriceFlags } from "@lakeze/shared/hooks/useAccommodationPriceFlags";
import { Button } from "@lakeze/shared/components/ui/button";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { Label } from "@lakeze/shared/components/ui/label";

interface Props {
  discountCodeId: string;
  accommodationId: string;
  scopeMode: "room_type" | "pricing_template";
  onBoundChange: (bound: boolean) => void;
  onSynced: (templateIds: string[]) => void;
}

// 折扣碼適用方案組合（只在已開啟新價格頁的館顯示）
export function DiscountCodeGroupBinding({ discountCodeId, accommodationId, scopeMode, onBoundChange, onSynced }: Props) {
  const flags = useAccommodationPriceFlags(accommodationId);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = flags.newPriceUiEnabled && scopeMode === "pricing_template";

  useEffect(() => {
    onBoundChange(false);
    if (!active) return;
    let cancelled = false;
    (async () => {
      const [g, l] = await Promise.all([
        supabase.from("pricing_template_groups" as any).select("id, name").eq("accommodation_id", accommodationId).order("name"),
        supabase.from("discount_code_template_groups" as any).select("group_id").eq("discount_code_id", discountCodeId),
      ]);
      if (cancelled) return;
      if (!g.error) setGroups((g.data || []) as any);
      const ids = l.error ? [] : ((l.data || []) as any[]).map((r) => r.group_id as string);
      setPicked(ids);
      onBoundChange(ids.length > 0);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, accommodationId, discountCodeId]);

  if (!flags.newPriceUiEnabled) return null;
  if (scopeMode !== "pricing_template") {
    return <p className="text-xs text-muted-foreground" data-testid="discount-group-binding-na">此館折扣碼依房型判斷適用範圍，不能使用折扣碼適用方案組合。</p>;
  }

  const save = async () => {
    setBusy(true);
    const { data, error: e } = await (supabase.rpc as any)("set_discount_code_template_groups", {
      p_discount_code_id: discountCodeId, p_group_ids: picked,
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setError(null);
    onSynced(Array.isArray(data) ? (data as string[]) : []);
    onBoundChange(picked.length > 0);
    toast.success(picked.length > 0 ? "已設定組合" : "已取消組合設定");
  };

  return (
    <div className="grid gap-2 rounded-md border p-3" data-testid="discount-group-binding">
      <Label>用組合設定適用方案（選填）</Label>
      <p className="text-xs text-muted-foreground" data-testid="discount-group-binding-help">選了組合後，下方『適用房價方案』會自動帶入組合裡的方案，之後組合有變動也會自動更新。不選就照原本方式自己勾。</p>
      {groups.length === 0 && <p className="text-xs text-muted-foreground">此館尚未建立折扣碼適用方案組合（到「房型與方案」頁建立）</p>}
      {groups.map((g) => (
        <label key={g.id} className="flex items-center gap-2 text-sm">
          <Checkbox checked={picked.includes(g.id)}
            onCheckedChange={(c) => setPicked((p) => (c ? [...p, g.id] : p.filter((x) => x !== g.id)))}
            data-testid={`discount-group-option-${g.id}`} />
          {g.name}
        </label>
      ))}
      {error && <p role="alert" className="text-sm text-destructive" data-testid="discount-group-binding-error">{error}</p>}
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={save} data-testid="discount-group-binding-save">儲存組合設定</Button>
    </div>
  );
}
