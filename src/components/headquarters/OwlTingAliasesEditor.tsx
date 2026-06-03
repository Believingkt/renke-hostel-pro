import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Tag, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** 若提供則鎖定編輯這家民宿；不提供則顯示挑選器。 */
  accommodationId?: string;
  title?: string;
  description?: string;
}

interface AccRow {
  id: string;
  name: string;
  owlting_aliases: string[] | null;
}

export function OwlTingAliasesEditor({ accommodationId, title, description }: Props) {
  const scoped = !!accommodationId;
  const [accs, setAccs] = useState<AccRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>(accommodationId ?? "");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("accommodation_info").select("id, name, owlting_aliases").order("name");
    if (scoped) q = q.eq("id", accommodationId!);
    const { data, error } = await q;
    if (error) toast.error("載入失敗：" + error.message);
    else {
      setAccs((data as AccRow[]) ?? []);
      if (scoped && data?.[0]) setSelectedId(data[0].id);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [accommodationId]);

  const current = useMemo(() => accs.find((a) => a.id === selectedId) ?? null, [accs, selectedId]);
  const aliases = current?.owlting_aliases ?? [];

  const persist = async (next: string[]) => {
    if (!current) return;
    setSaving(true);
    const { error } = await supabase
      .from("accommodation_info")
      .update({ owlting_aliases: next })
      .eq("id", current.id);
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    setAccs((prev) => prev.map((a) => (a.id === current.id ? { ...a, owlting_aliases: next } : a)));
    toast.success("已更新別名");
  };

  const addAlias = async () => {
    const v = draft.trim();
    if (!v) return;
    if (aliases.includes(v)) {
      toast.info("已存在相同別名");
      return;
    }
    await persist([...aliases, v]);
    setDraft("");
  };

  const removeAlias = async (a: string) => {
    await persist(aliases.filter((x) => x !== a));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary" />
          {title ?? "奧丁丁民宿別名"}
        </CardTitle>
        <CardDescription>
          {description ??
            "用於奧丁丁訂單信件自動匹配本民宿。若信件中的民宿名與系統名稱字串有差異（例：「品雲岫海景渡假會館」↔「雲岫海景度假會館」），把信件上的別名加進來，下次就會自動匹配。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!scoped && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">民宿</span>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-[280px]"><SelectValue placeholder="選擇民宿" /></SelectTrigger>
              <SelectContent>
                {accs.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {current && (
          <>
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {aliases.length === 0 && (
                <span className="text-xs text-muted-foreground">尚未新增別名</span>
              )}
              {aliases.map((a) => (
                <Badge key={a} variant="secondary" className="gap-1 pr-1 text-sm">
                  {a}
                  <button
                    onClick={() => removeAlias(a)}
                    className="ml-1 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                    aria-label={`移除 ${a}`}
                    disabled={saving}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAlias(); } }}
                placeholder="輸入奧丁丁信件中的民宿名稱"
                disabled={saving}
              />
              <Button onClick={addAlias} disabled={saving || !draft.trim()}>
                <Plus className="h-4 w-4 mr-1" /> 新增
              </Button>
            </div>
          </>
        )}

        {!loading && !current && !scoped && (
          <p className="text-xs text-muted-foreground">請先選擇民宿</p>
        )}
      </CardContent>
    </Card>
  );
}
