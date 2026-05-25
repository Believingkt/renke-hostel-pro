import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShoppingBag, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";

interface AddonSale {
  id: string;
  accommodation_id: string;
  sale_date: string;
  item_name: string;
  category: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  notes: string | null;
  related_order_id: string | null;
  created_at: string;
}

const CATEGORY_OPTIONS = ["商品", "餐飲", "體驗", "其他"];

const fmt = (n: number) => Math.round(n).toLocaleString("zh-TW");

interface FormState {
  sale_date: string;
  item_name: string;
  category: string;
  quantity: string;
  unit_price: string;
  notes: string;
  related_order_id: string;
}

function emptyForm(): FormState {
  return {
    sale_date: format(new Date(), "yyyy-MM-dd"),
    item_name: "",
    category: "none",
    quantity: "1",
    unit_price: "0",
    notes: "",
    related_order_id: "",
  };
}

export default function AddonCenter() {
  const { currentAccommodationId } = useAccommodation();
  const { canEdit } = useStaffPermissions();
  const editable = canEdit("addon_center");
  const [monthStr, setMonthStr] = useState(format(new Date(), "yyyy-MM"));
  const [items, setItems] = useState<AddonSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const monthStart = useMemo(
    () => format(startOfMonth(new Date(monthStr + "-01")), "yyyy-MM-dd"),
    [monthStr]
  );
  const monthEnd = useMemo(
    () => format(endOfMonth(new Date(monthStr + "-01")), "yyyy-MM-dd"),
    [monthStr]
  );

  async function load() {
    if (!currentAccommodationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("addon_sales")
      .select("*")
      .eq("accommodation_id", currentAccommodationId)
      .gte("sale_date", monthStart)
      .lte("sale_date", monthEnd)
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error("載入失敗：" + error.message);
    setItems((data || []) as AddonSale[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccommodationId, monthStart, monthEnd]);

  const totals = useMemo(() => {
    const total = items.reduce((s, x) => s + (x.total_amount || 0), 0);
    const count = items.length;
    const qty = items.reduce((s, x) => s + (x.quantity || 0), 0);
    return { total, count, qty };
  }, [items]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((it) => {
      const k = it.category || "未分類";
      m.set(k, (m.get(k) || 0) + (it.total_amount || 0));
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(it: AddonSale) {
    setEditingId(it.id);
    setForm({
      sale_date: it.sale_date,
      item_name: it.item_name,
      category: it.category || "none",
      quantity: String(it.quantity),
      unit_price: String(it.unit_price),
      notes: it.notes || "",
      related_order_id: it.related_order_id || "",
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!currentAccommodationId) return;
    const name = form.item_name.trim();
    const qty = parseInt(form.quantity, 10);
    const price = parseInt(form.unit_price, 10);
    if (!name) return toast.error("請輸入品項名稱");
    if (!form.sale_date) return toast.error("請選擇日期");
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("數量需為正整數");
    if (!Number.isFinite(price) || price < 0) return toast.error("單價需為非負整數");

    setSaving(true);
    const payload = {
      accommodation_id: currentAccommodationId,
      sale_date: form.sale_date,
      item_name: name,
      category: form.category === "none" ? null : form.category,
      quantity: qty,
      unit_price: price,
      total_amount: qty * price,
      notes: form.notes.trim() || null,
      related_order_id: form.related_order_id.trim() || null,
    };

    const { error } = editingId
      ? await supabase.from("addon_sales").update(payload).eq("id", editingId)
      : await supabase.from("addon_sales").insert(payload);
    setSaving(false);
    if (error) return toast.error("儲存失敗：" + error.message);
    toast.success(editingId ? "已更新" : "已新增");
    setOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這筆加購紀錄嗎？")) return;
    const { error } = await supabase.from("addon_sales").delete().eq("id", id);
    if (error) return toast.error("刪除失敗：" + error.message);
    toast.success("已刪除");
    load();
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <AdminPageHeader
        title="購物商品"
        description="記錄非訂房收入（如商品、餐飲、體驗等銷售）"
        icon={ShoppingBag}
        action={
          <div className="flex items-center gap-2">
            <MonthPicker value={monthStr} onChange={(v) => v && v !== "all" && setMonthStr(v)} />
            {editable && (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> 新增加購
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本月加購總營收</CardDescription>
            <CardTitle className="text-3xl text-primary tabular-nums">
              NT$ {fmt(totals.total)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本月筆數</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{totals.count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>本月總銷售數量</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{totals.qty}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {byCategory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">分類佔比</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {byCategory.map(([cat, amt]) => (
                <div key={cat} className="rounded-md border px-3 py-2 text-sm">
                  <span className="text-muted-foreground mr-2">{cat}</span>
                  <span className="font-medium tabular-nums">NT$ {fmt(amt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">加購紀錄</CardTitle>
          <CardDescription>顯示所選月份的加購銷售明細</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">載入中…</p>
          ) : items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">本月尚無加購紀錄</p>
          ) : (
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">日期</TableHead>
                  <TableHead>品項</TableHead>
                  <TableHead className="whitespace-nowrap">分類</TableHead>
                  <TableHead className="text-right whitespace-nowrap">數量</TableHead>
                  <TableHead className="text-right whitespace-nowrap">單價</TableHead>
                  <TableHead className="text-right whitespace-nowrap">小計</TableHead>
                  <TableHead>備註</TableHead>
                  <TableHead className="whitespace-nowrap">關聯訂單</TableHead>
                  {editable && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="whitespace-nowrap">{it.sale_date}</TableCell>
                    <TableCell>{it.item_name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {it.category || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(it.unit_price)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {fmt(it.total_amount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                      {it.notes || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {it.related_order_id || "—"}
                    </TableCell>
                    {editable && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(it)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(it.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "編輯加購紀錄" : "新增加購紀錄"}</DialogTitle>
            <DialogDescription>非訂房收入，將計入業主月結的商品收入</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>銷售日期</Label>
              <Input
                type="date"
                value={form.sale_date}
                onChange={(e) => setForm({ ...form, sale_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>分類</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇分類" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未分類</SelectItem>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>品項名稱</Label>
              <Input
                value={form.item_name}
                onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                placeholder="例：在地伴手禮包"
              />
            </div>
            <div className="space-y-1.5">
              <Label>數量</Label>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>單價 (NT$)</Label>
              <Input
                type="number"
                min={0}
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>關聯訂單編號（選填）</Label>
              <Input
                value={form.related_order_id}
                onChange={(e) => setForm({ ...form, related_order_id: e.target.value })}
                placeholder="若此筆銷售與某張訂單相關，可填訂單 ID"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>備註</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="col-span-2 text-sm text-muted-foreground">
              小計：
              <span className="font-medium tabular-nums text-foreground ml-1">
                NT$ {fmt(
                  (parseInt(form.quantity, 10) || 0) * (parseInt(form.unit_price, 10) || 0)
                )}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
