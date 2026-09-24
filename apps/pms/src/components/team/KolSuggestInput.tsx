import { useEffect, useRef, useState } from "react";
import { Input } from "@lakeze/shared/components/ui/input";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { kolNameKey } from "@/lib/kolInviteValidation";

type Suggestion = {
  id: string;
  name: string | null;
  ig_handle: string | null;
  cid_code: string | null;
  venue_name: string | null;
  check_in_date: string | null;
  name_normalized?: string | null;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** 依哪個欄位搜尋既有資料 */
  field: "name" | "ig_handle" | "cid_code";
  placeholder?: string;
  /** 選取既有資料時，可一併回填其他欄位 */
  onPick?: (s: Suggestion) => void;
  excludeId?: string | null;
};

/**
 * 可輸入的自動完成：邊打邊查 kol_profiles 歷史資料，
 * 讓「同一人不同寫法」（大小寫／全半形／錯字）能沿用既有寫法。
 */
export default function KolSuggestInput({ value, onChange, field, placeholder, onPick, excludeId }: Props) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = value.trim();
    if (!touched || q.length < 1) {
      setItems([]);
      return;
    }
    const t = setTimeout(async () => {
      const esc = (s: string) => s.replace(/[%_]/g, (m) => `\\${m}`);
      const key = field === "name" ? kolNameKey(q) : "";
      // 名稱：同時比對原始寫法與正規化後寫法，讓全半形／大小寫差異也能命中
      const filter =
        field === "name" && key
          ? `name.ilike.%${esc(q)}%,name_normalized.ilike.%${esc(key)}%`
          : null;

      let query = supabase
        .from("kol_profiles")
        .select("id, name, ig_handle, cid_code, venue_name, check_in_date, name_normalized")
        .order("check_in_date", { ascending: false, nullsFirst: false })
        .limit(60);
      if (filter) query = query.or(filter);
      else query = query.ilike(field, `%${esc(q)}%`);
      if (excludeId) query = query.neq("id", excludeId);

      const { data } = await query;
      const rows = (data as Suggestion[]) ?? [];

      // 依「正規化後匹配程度」排序：完全相同 > 開頭相符 > 包含
      const norm = (s: string) => (field === "name" ? kolNameKey(s) : s.trim().toLowerCase());
      const nq = norm(q);
      const score = (s: Suggestion) => {
        const v = norm(((s as any)[field] ?? "").toString());
        if (!v || !nq) return 3;
        if (v === nq) return 0;
        if (v.startsWith(nq)) return 1;
        if (v.includes(nq)) return 2;
        return 3;
      };
      // 只有「同寫法＋同 CID＋同入住日」才視為重複，其餘歷史紀錄都列出
      const seen = new Set<string>();
      const ranked = rows
        .map((r) => ({ r, s: score(r) }))
        .sort((a, b) => a.s - b.s || (b.r.check_in_date ?? "").localeCompare(a.r.check_in_date ?? ""))
        .filter(({ r }) => {
          const k = `${norm(((r as any)[field] ?? "").toString())}|${r.cid_code ?? ""}|${r.check_in_date ?? ""}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 12)
        .map(({ r }) => r);


      setItems(ranked);
      setOpen(true);
    }, 200);
    return () => clearTimeout(t);
  }, [value, field, excludeId, touched]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const exactMatch = items.some((i) => {
    const v = ((i as any)[field] ?? "").toString();
    return field === "name"
      ? kolNameKey(v) === kolNameKey(value)
      : v.trim().toLowerCase() === value.trim().toLowerCase();
  });

  return (
    <div className="relative" ref={boxRef}>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setTouched(true);
          onChange(e.target.value);
        }}
        onFocus={() => items.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && items.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="border-b bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            相符的歷史紀錄 {items.length} 筆{items.length >= 12 ? "（僅顯示前 12 筆，請再多打幾個字縮小範圍）" : ""}
          </div>
          <div className="max-h-56 overflow-y-auto">

            {items.map((s) => (
              <button
                key={s.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  const picked = ((s as any)[field] ?? "").toString();
                  onChange(picked);
                  onPick?.(s);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{s.name ?? "-"}</span>
                <span className="text-muted-foreground">
                  {" "}
                  ｜ {s.ig_handle ?? "-"} ｜ {s.cid_code ?? "-"} ｜ {s.venue_name ?? "-"} ｜ {s.check_in_date ?? "-"}
                </span>
              </button>
            ))}
          </div>
          {!exactMatch && value.trim().length >= 1 && (
            <div className="border-t bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
              查無完全相同的資料，將建立新的寫法「{value.trim()}」
            </div>
          )}
        </div>
      )}
    </div>
  );
}
