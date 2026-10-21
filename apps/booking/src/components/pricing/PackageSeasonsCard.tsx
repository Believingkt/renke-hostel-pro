import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { PACKAGE_TIERS, type PackageTier } from "@lakeze/shared/utils/packageTierEditor";

export const PRICE_PRIORITY_TEXT =
  "價格優先順序：手動單日價最優先；沒有手動價時，先看當天有沒有被指定成平日／旺日／假日（日型例外），再用當天所在季節區段的價格，沒有季節區段就用方案的平日／旺日／假日價。";

interface Season {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  tier_prices: Partial<Record<PackageTier, { sale: number; original: number }>>;
}
type Draft = { id: string | null; name: string; from: string; to: string; prices: Record<string, { sale: string; original: string }> };

interface Props {
  pkg: { id: string; name: string; tier_prices: Record<string, unknown> | null };
  canEdit: boolean;
  onChanged?: () => void;
}

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/,/g, "")));

export function PackageSeasonsCard({ pkg, canEdit, onChanged }: Props) {
  const tiers = PACKAGE_TIERS.filter((t) => pkg.tier_prices && t.key in pkg.tier_prices);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from("package_seasons" as any)
      .select("id, name, date_from, date_to, tier_prices")
      .eq("package_id", pkg.id)
      .order("date_from", { ascending: true });
    if (!e) setSeasons((data || []) as unknown as Season[]);
  }, [pkg.id]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => {
    setError(null);
    setDraft({ id: null, name: "", from: "", to: "", prices: Object.fromEntries(tiers.map((t) => [t.key, { sale: "", original: "" }])) });
  };
  const startEdit = (s: Season) => {
    setError(null);
    setDraft({
      id: s.id, name: s.name, from: s.date_from, to: s.date_to,
      prices: Object.fromEntries(tiers.map((t) => [t.key, {
        sale: s.tier_prices?.[t.key]?.sale != null ? String(s.tier_prices[t.key]!.sale) : "",
        original: s.tier_prices?.[t.key]?.original != null ? String(s.tier_prices[t.key]!.original) : "",
      }])),
    });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const p_tier_prices = Object.fromEntries(
      Object.entries(draft.prices).map(([k, v]) => [k, { sale: num(v.sale), original: num(v.original) }]),
    );
    const { data, error: e } = await (supabase.rpc as any)("save_package_season", {
      p_package_id: pkg.id, p_season_id: draft.id, p_name: draft.name,
      p_date_from: draft.from || null, p_date_to: draft.to || null, p_tier_prices,
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    toast.success(`已儲存季節區段，更新 ${(data as any)?.written ?? 0} 天價格`);
    setDraft(null);
    await load();
    onChanged?.();
  };

  const remove = async (id: string) => {
    setBusy(true);
    const { error: e } = await (supabase.rpc as any)("delete_package_season", { p_season_id: id });
    setBusy(false);
    setPendingDelete(null);
    if (e) { setError(e.message); return; }
    toast.success("已刪除季節區段");
    await load();
    onChanged?.();
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3" data-testid={`package-seasons-${pkg.id}`}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">季節區段</Label>
        {canEdit && !draft && (
          <Button size="sm" variant="outline" onClick={startNew} data-testid={`season-add-${pkg.id}`}>新增季節區段</Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="price-priority-note">{PRICE_PRIORITY_TEXT}</p>
      {error && <p role="alert" className="text-sm text-destructive" data-testid={`season-error-${pkg.id}`}>{error}</p>}
      {seasons.length === 0 && !draft && <p className="text-xs text-muted-foreground">尚未設定季節區段</p>}
      {seasons.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={`season-row-${s.id}`}>
          <span>
            {s.name}｜{s.date_from} ～ {s.date_to}｜
            {tiers.map((t) => `${t.label} ${s.tier_prices?.[t.key]?.sale ?? "—"}／${s.tier_prices?.[t.key]?.original ?? "—"}`).join("、")}
          </span>
          {canEdit && (
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => startEdit(s)} data-testid={`season-edit-${s.id}`}>編輯</Button>
              {pendingDelete === s.id ? (
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => remove(s.id)} data-testid={`season-delete-confirm-${s.id}`}>確認刪除</Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setPendingDelete(s.id)} data-testid={`season-delete-${s.id}`}>刪除</Button>
              )}
            </span>
          )}
        </div>
      ))}
      {draft && (
        <SeasonForm draft={draft} tiers={tiers} busy={busy} onChange={setDraft} onSave={save} onCancel={() => setDraft(null)} />
      )}
    </div>
  );
}

function SeasonForm({ draft, tiers, busy, onChange, onSave, onCancel }: {
  draft: Draft; tiers: typeof PACKAGE_TIERS; busy: boolean;
  onChange: (d: Draft) => void; onSave: () => void; onCancel: () => void;
}) {
  const setPrice = (k: string, f: "sale" | "original", v: string) =>
    onChange({ ...draft, prices: { ...draft.prices, [k]: { ...draft.prices[k], [f]: v } } });
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3" data-testid="season-form">
      <Input placeholder="區段名稱（例如：暑假）" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} data-testid="season-name" />
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" value={draft.from} onChange={(e) => onChange({ ...draft, from: e.target.value })} data-testid="season-from" />
        <Input type="date" value={draft.to} onChange={(e) => onChange({ ...draft, to: e.target.value })} data-testid="season-to" />
      </div>
      {tiers.map((t) => (
        <div key={t.key} className="grid grid-cols-[60px_1fr_1fr] items-center gap-2">
          <span className="text-sm">{t.label}</span>
          <Input inputMode="numeric" placeholder="售價" value={draft.prices[t.key]?.sale ?? ""} onChange={(e) => setPrice(t.key, "sale", e.target.value)} data-testid={`season-sale-${t.key}`} />
          <Input inputMode="numeric" placeholder="原價" value={draft.prices[t.key]?.original ?? ""} onChange={(e) => setPrice(t.key, "original", e.target.value)} data-testid={`season-original-${t.key}`} />
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={onSave} data-testid="season-save">儲存</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} data-testid="season-cancel">取消</Button>
      </div>
    </div>
  );
}
