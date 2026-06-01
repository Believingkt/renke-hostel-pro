import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";

interface Accommodation {
  id: string;
  name: string;
}

interface OwnerRow {
  id: string;
  accommodation_id: string;
  owner_name: string;
  email: string;
  line_user_id: string | null;
  notify_priority: number;
  is_active: boolean;
  notes: string | null;
}

interface EditState {
  id?: string;
  accommodation_id: string;
  owner_name: string;
  email: string;
  line_user_id: string;
  notify_priority: number;
  is_active: boolean;
  notes: string;
}

const emptyEdit: EditState = {
  accommodation_id: "",
  owner_name: "",
  email: "",
  line_user_id: "",
  notify_priority: 1,
  is_active: true,
  notes: "",
};

export function AccommodationOwnersManagement() {
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAcc, setFilterAcc] = useState<string>("all");
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<EditState>(emptyEdit);
  const [deleteTarget, setDeleteTarget] = useState<OwnerRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: accs }, { data: ows }] = await Promise.all([
      supabase.from("accommodation_info").select("id,name").order("name"),
      supabase
        .from("accommodation_owners")
        .select("id,accommodation_id,owner_name,email,line_user_id,notify_priority,is_active,notes")
        .order("notify_priority", { ascending: true }),
    ]);
    setAccommodations((accs as Accommodation[]) ?? []);
    setOwners((ows as OwnerRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const accName = (id: string) =>
    accommodations.find((a) => a.id === id)?.name ?? "(未知)";

  const openNew = () => {
    setEdit({ ...emptyEdit, accommodation_id: accommodations[0]?.id ?? "" });
    setEditOpen(true);
  };

  const openEdit = (row: OwnerRow) => {
    setEdit({
      id: row.id,
      accommodation_id: row.accommodation_id,
      owner_name: row.owner_name,
      email: row.email,
      line_user_id: row.line_user_id ?? "",
      notify_priority: row.notify_priority,
      is_active: row.is_active,
      notes: row.notes ?? "",
    });
    setEditOpen(true);
  };

  const save = async () => {
    if (!edit.accommodation_id) return toast.error("請選擇民宿");
    if (!edit.owner_name.trim()) return toast.error("請輸入聯絡人姓名");
    if (!edit.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(edit.email.trim())) {
      return toast.error("請輸入有效 Email");
    }
    setSaving(true);
    const payload = {
      accommodation_id: edit.accommodation_id,
      owner_name: edit.owner_name.trim(),
      email: edit.email.trim().toLowerCase(),
      line_user_id: edit.line_user_id.trim() || null,
      notify_priority: edit.notify_priority,
      is_active: edit.is_active,
      notes: edit.notes.trim() || null,
    };
    const { error } = edit.id
      ? await supabase.from("accommodation_owners").update(payload).eq("id", edit.id)
      : await supabase.from("accommodation_owners").insert(payload);
    setSaving(false);
    if (error) return toast.error(`儲存失敗：${error.message}`);
    toast.success(edit.id ? "已更新" : "已新增");
    setEditOpen(false);
    await load();
  };

  const del = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("accommodation_owners").delete().eq("id", deleteTarget.id);
    if (error) return toast.error(`刪除失敗：${error.message}`);
    toast.success("已刪除");
    setDeleteTarget(null);
    await load();
  };

  const filtered = filterAcc === "all" ? owners : owners.filter((o) => o.accommodation_id === filterAcc);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            民宿業主聯絡人
          </CardTitle>
          <CardDescription>
            奧丁丁 PII 補單通知會依優先序寄給此處的業主 Email（小數字優先）
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterAcc} onValueChange={setFilterAcc}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部民宿</SelectItem>
              {accommodations.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openNew} disabled={accommodations.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> 新增
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>民宿</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>LINE</TableHead>
              <TableHead className="text-center">優先序</TableHead>
              <TableHead className="text-center">啟用</TableHead>
              <TableHead>備註</TableHead>
              <TableHead className="text-right">動作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="text-sm">{accName(o.accommodation_id)}</TableCell>
                <TableCell className="font-medium">{o.owner_name}</TableCell>
                <TableCell className="text-sm">{o.email}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{o.line_user_id ?? "—"}</TableCell>
                <TableCell className="text-center tabular-nums">{o.notify_priority}</TableCell>
                <TableCell className="text-center">
                  {o.is_active ? <Badge>啟用</Badge> : <Badge variant="outline">停用</Badge>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={o.notes ?? ""}>
                  {o.notes ?? "—"}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(o)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  尚未設定業主聯絡人
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{edit.id ? "編輯業主聯絡人" : "新增業主聯絡人"}</DialogTitle>
              <DialogDescription>用於奧丁丁 PII 補單通知派送</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>民宿</Label>
                <Select
                  value={edit.accommodation_id}
                  onValueChange={(v) => setEdit({ ...edit, accommodation_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="選擇民宿" /></SelectTrigger>
                  <SelectContent>
                    {accommodations.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>姓名</Label>
                  <Input value={edit.owner_name}
                    onChange={(e) => setEdit({ ...edit, owner_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>優先序（小=先）</Label>
                  <Input type="number" min={1} value={edit.notify_priority}
                    onChange={(e) => setEdit({ ...edit, notify_priority: Number(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>LINE User ID（選填，未來通知用）</Label>
                <Input value={edit.line_user_id}
                  onChange={(e) => setEdit({ ...edit, line_user_id: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>備註</Label>
                <Input value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>啟用</Label>
                <Switch checked={edit.is_active}
                  onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
              <Button onClick={save} disabled={saving}>{saving ? "儲存中..." : "儲存"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認刪除？</AlertDialogTitle>
              <AlertDialogDescription>
                將刪除「{deleteTarget?.owner_name}」（{deleteTarget?.email}），此操作無法復原。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={del}>刪除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
