import { useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lakeze/shared/components/ui/dialog";
import { PUBLISH_DEADLINE_DAYS, addDaysYmd } from "@/lib/kolPublishSchedule";

export interface KolPublishBackfillRow {
  id: string;
  name: string | null;
  venue_name?: string | null;
  _accommodation_name?: string;
  check_in_date: string | null;
  publish_date: string | null;
  publish_url: string | null;
}

interface Props {
  row: KolPublishBackfillRow | null;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function KolPublishBackfillDialog({ row, canEdit, onOpenChange, onSaved }: Props) {
  const [publishDate, setPublishDate] = useState("");
  const [publishUrl, setPublishUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPublishDate(row?.publish_date ?? "");
    setPublishUrl(row?.publish_url ?? "");
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!row) return null;

  const place = row._accommodation_name || row.venue_name || "";
  const deadline = row.check_in_date
    ? addDaysYmd(String(row.check_in_date), PUBLISH_DEADLINE_DAYS)
    : null;

  const handleSave = async () => {
    const url = publishUrl.trim();
    const date = publishDate.trim();
    if (!url && !date) {
      toast.error("請至少填寫發布日期或上片連結");
      return;
    }
    if (url && !/^https?:\/\//i.test(url)) {
      toast.error("上片連結請填完整網址（以 http:// 或 https:// 開頭）");
      return;
    }
    if (date && row.check_in_date && date < String(row.check_in_date)) {
      toast.error("發布日期不可早於入住日期");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("kol_profiles")
      .update({ publish_url: url || null, publish_date: date || null })
      .eq("id", row.id);
    setSaving(false);
    if (error) {
      toast.error(`儲存失敗：${error.message}`);
      return;
    }
    toast.success("已回填上片資料");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>回填上片資料</DialogTitle>
          <DialogDescription>
            {(row.name?.trim() || "未命名 KOL") + (place ? `｜${place}` : "")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
          <div>入住日期：{row.check_in_date || "-"}</div>
          <div>上片期限：{deadline || "-"}</div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kol-publish-date">發布日期</Label>
            <Input
              id="kol-publish-date"
              type="date"
              value={publishDate}
              disabled={!canEdit || saving}
              onChange={(e) => setPublishDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kol-publish-url">上片連結</Label>
            <Input
              id="kol-publish-url"
              type="url"
              placeholder="https://www.instagram.com/..."
              value={publishUrl}
              disabled={!canEdit || saving}
              onChange={(e) => setPublishUrl(e.target.value)}
            />
          </div>
        </div>

        {!canEdit && (
          <p className="text-sm text-muted-foreground">
            你沒有編輯這筆邀約的權限，請通知該筆的星探或主管回填。
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            關閉
          </Button>
          {canEdit && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default KolPublishBackfillDialog;
