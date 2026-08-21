import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type Suggestion = {
  id: string;
  name: string | null;
  ig_handle: string | null;
  cid_code: string | null;
  venue_name: string | null;
  check_in_date: string | null;
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
    if (!touched || q.length < 2) {
      setItems([]);
      return;
    }
    const t = setTimeout(async () => {
      const esc = q.replace(/[%_]/g, (m) => `\\${m}`);
      let query = supabase
        .from("kol_profiles")
        .select("id, name, ig_handle, cid_code, venue_name, check_in_date")
        .ilike(field, `%${esc}%`)
        .order("check_in_date", { ascending: false, nullsFirst: false })
        .limit(8);
      if (excludeId) query = query.neq("id", excludeId);
      const { data } = await query;
      setItems((data as Suggestion[]) ?? []);
      setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [value, field, excludeId, touched]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const exactMatch = items.some(
    (i) => ((i as any)[field] ?? "").toString().trim().toLowerCase() === value.trim().toLowerCase(),
  );

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
          {!exactMatch && value.trim().length >= 2 && (
            <div className="border-t bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
              查無完全相同的資料，將建立新的寫法「{value.trim()}」
            </div>
          )}
        </div>
      )}
    </div>
  );
}
