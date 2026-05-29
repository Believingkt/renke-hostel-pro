import { Fragment, useEffect, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [historyByAcc, setHistoryByAcc] = useState<Map<string, CommissionRow[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<RowView | null>(null);
  const [closerRate, setCloserRate] = useState<string>("");
  const [videoRate, setVideoRate] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<string>(
    format(new Date(), "yyyy-MM-dd"),
  );
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
      const history = new Map<string, CommissionRow[]>();
      (settings ?? []).forEach((s: any) => {
        if (!latest.has(s.accommodation_id)) latest.set(s.accommodation_id, s);
        const arr = history.get(s.accommodation_id) ?? [];
        arr.push(s);
        history.set(s.accommodation_id, arr);
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
      setHistoryByAcc(history);
    } catch (e: any) {
      toast.error("讀取分潤比例失敗：" + (e.message || ""));
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEdit(row: RowView) {
    setEditing(row);
    setCloserRate(row.closer_rate != null ? String(row.closer_rate) : "");
    setVideoRate(row.video_rate != null ? String(row.video_rate) : "");
    setEffectiveFrom(format(new Date(), "yyyy-MM-dd"));
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
    if (!effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      toast.error("請輸入有效的生效日期");
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
          effective_from: effectiveFrom,
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
              <TableHead className="w-10"></TableHead>
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
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  載入中...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  尚無資料
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const isOpen = expanded.has(r.id);
                const history = historyByAcc.get(r.id) ?? [];
                return (
                  <Fragment key={r.id}>
                    <TableRow key={r.id}>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => toggleExpand(r.id)}
                          aria-label="展開歷史紀錄"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
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
                    {isOpen && (
                      <TableRow key={`${r.id}-history`} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell colSpan={5} className="p-0">
                          <div className="px-4 py-3">
                            <div className="text-xs text-muted-foreground mb-2">歷史紀錄</div>
                            {history.length === 0 ? (
                              <div className="text-sm text-muted-foreground py-2">
                                尚無歷史紀錄
                              </div>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-40">成交組分潤%</TableHead>
                                    <TableHead className="w-40">影音組分潤%</TableHead>
                                    <TableHead>生效日期</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {history.map((h, idx) => (
                                    <TableRow key={`${r.id}-h-${idx}`}>
                                      <TableCell>
                                        {h.closer_rate != null ? `${h.closer_rate}%` : "—"}
                                      </TableCell>
                                      <TableCell>
                                        {h.video_rate != null ? `${h.video_rate}%` : "—"}
                                      </TableCell>
                                      <TableCell>{h.effective_from}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
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
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
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
