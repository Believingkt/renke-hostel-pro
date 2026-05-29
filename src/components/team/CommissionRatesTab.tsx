import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Accommodation {
  id: string;
  name: string;
}

interface CommissionRow {
  accommodation_id: string;
  closer_rate: number | null;
  video_rate: number | null;
  effective_from: string;
}

interface RowView extends Accommodation {
  closer_rate: number | null;
  video_rate: number | null;
  effective_from: string | null;
}

export default function CommissionRatesTab() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RowView[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<RowView | null>(null);
  const [closerRate, setCloserRate] = useState<string>("");
  const [videoRate, setVideoRate] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [{ data: accs }, { data: settings }] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("id, name")
          .order("name", { ascending: true }),
        supabase
          .from("accommodation_commission_settings")
          .select("accommodation_id, closer_rate, video_rate, effective_from")
          .order("effective_from", { ascending: false }),
      ]);

      const latest = new Map<string, CommissionRow>();
      (settings ?? []).forEach((s: any) => {
        if (!latest.has(s.accommodation_id)) latest.set(s.accommodation_id, s);
      });

      const merged: RowView[] = (accs ?? []).map((a: any) => {
        const s = latest.get(a.id);
        return {
          id: a.id,
          name: a.name,
          closer_rate: s?.closer_rate ?? null,
          video_rate: s?.video_rate ?? null,
          effective_from: s?.effective_from ?? null,
        };
      });
      setRows(merged);
    } catch (e: any) {
      toast.error("讀取分潤比例失敗：" + (e.message || ""));
    } finally {
      setLoading(false);
    }
  }

  function openEdit(row: RowView) {
    setEditing(row);
    setCloserRate(row.closer_rate != null ? String(row.closer_rate) : "");
    setVideoRate(row.video_rate != null ? String(row.video_rate) : "");
    setEffectiveFrom(new Date());
    setEditOpen(true);
  }

  async function handleSave() {
    if (!editing) return;
    const cr = Number(closerRate);
    const vr = Number(videoRate);
    if (Number.isNaN(cr) || cr < 0 || cr > 100) {
      toast.error("成交組分潤% 必須在 0-100");
      return;
    }
    if (Number.isNaN(vr) || vr < 0 || vr > 100) {
      toast.error("影音組分潤% 必須在 0-100");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_commission_settings")
        .insert({
          accommodation_id: editing.id,
          closer_rate: cr,
          video_rate: vr,
          effective_from: format(effectiveFrom, "yyyy-MM-dd"),
        });
      if (error) throw error;
      toast.success("已儲存");
      setEditOpen(false);
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error("儲存失敗：" + (e.message || ""));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>民宿名稱</TableHead>
              <TableHead className="w-32">成交組分潤%</TableHead>
              <TableHead className="w-32">影音組分潤%</TableHead>
              <TableHead className="w-36">生效日期</TableHead>
              <TableHead className="w-20 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  載入中...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  尚無資料
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.closer_rate != null ? `${r.closer_rate}%` : "—"}</TableCell>
                  <TableCell>{r.video_rate != null ? `${r.video_rate}%` : "—"}</TableCell>
                  <TableCell>{r.effective_from ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(r)}
                      aria-label="編輯"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編輯分潤比例 - {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>成交組分潤%</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={closerRate}
                onChange={(e) => setCloserRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>影音組分潤%</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={videoRate}
                onChange={(e) => setVideoRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>生效日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !effectiveFrom && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {effectiveFrom ? format(effectiveFrom, "yyyy-MM-dd") : "選擇日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={effectiveFrom}
                    onSelect={(d) => d && setEffectiveFrom(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
