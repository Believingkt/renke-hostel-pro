import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { NO_ROWS_AFFECTED_MESSAGE } from "@lakeze/shared/lib/supabaseWriteGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { Textarea } from "@lakeze/shared/components/ui/textarea";
import { Switch } from "@lakeze/shared/components/ui/switch";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { useToast } from "@lakeze/shared/hooks/use-toast";
import { fetchOfficialVenueIntro, htmlToPlainText } from "@lakeze/shared/lib/groupBuyVenueIntro";
import { GripVertical, Loader2, RefreshCw, Save, X } from "lucide-react";

interface Props {
  accommodationId: string;
}

interface FormState {
  description: string;
  facilities: string;
  check_in_notice: string;
  phone: string;
  address: string;
  gallery_urls: string[];
  is_visible: boolean;
}

const emptyForm: FormState = {
  description: "",
  facilities: "",
  check_in_notice: "",
  phone: "",
  address: "",
  gallery_urls: [],
  is_visible: true,
};

/** 後台：編輯此民宿在團購頁顯示的簡介／設施／入住須知／聯絡資訊 */
export function GroupBuyVenueIntroEditor({ accommodationId }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [savedForm, setSavedForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const dirty = savedForm ? JSON.stringify(savedForm) !== JSON.stringify(form) : false;

  const movePhoto = (from: number, to: number) => {
    setForm((f) => {
      if (from === to || from < 0 || to < 0 || to >= f.gallery_urls.length) return f;
      const next = [...f.gallery_urls];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...f, gallery_urls: next };
    });
  };

  const load = useCallback(async () => {
    if (!accommodationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("group_buy_venue_intros")
      .select("*")
      .eq("accommodation_id", accommodationId)
      .maybeSingle();

    let next: FormState;
    if (data) {
      const row = data as any;
      next = {
        description: htmlToPlainText(row.description),
        facilities: (row.facilities ?? []).join("、"),
        check_in_notice: htmlToPlainText(row.check_in_notice),
        phone: row.phone ?? "",
        address: row.address ?? "",
        gallery_urls: row.gallery_urls ?? [],
        is_visible: row.is_visible ?? true,
      };
    } else {
      const official = await fetchOfficialVenueIntro(accommodationId);
      next = {
        description: htmlToPlainText(official?.description),
        facilities: (official?.facilities ?? []).join("、"),
        check_in_notice: "",
        phone: official?.phone ?? "",
        address: official?.address ?? "",
        gallery_urls: (official?.gallery_urls ?? []).slice(0, 12),
        is_visible: true,
      };
    }
    setForm(next);
    setSavedForm(data ? next : null);
    setLoading(false);
  }, [accommodationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);


  const syncFromOfficial = async () => {
    const official = await fetchOfficialVenueIntro(accommodationId);
    if (!official) {
      toast({ title: "查無官網內容", variant: "destructive" });
      return;
    }
    setForm((f) => ({
      ...f,
      description: htmlToPlainText(official.description),
      facilities: official.facilities.join("、"),
      // 入住前提醒為此區獨立內容，不再從官網「訂房須知」覆蓋
      phone: official.phone ?? "",
      address: official.address ?? "",
      gallery_urls: official.gallery_urls.slice(0, 12),
    }));
    toast({ title: "已帶入官網內容", description: "請確認後按儲存。" });
  };

  const save = async () => {
    setSaving(true);
    const snapshot = form;
    const { data, error } = await supabase
      .from("group_buy_venue_intros")
      .upsert(
        {
          accommodation_id: accommodationId,
          description: snapshot.description || null,
          facilities: snapshot.facilities
            .split(/[、,，\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          check_in_notice: snapshot.check_in_notice || null,
          phone: snapshot.phone || null,
          address: snapshot.address || null,
          gallery_urls: snapshot.gallery_urls,
          is_visible: snapshot.is_visible,
        } as any,
        { onConflict: "accommodation_id" },
      )
      .select("gallery_urls")
      .maybeSingle();
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    if (!data) {
      // RLS 擋下時 upsert 不會回傳資料列，必須明確提示，避免假成功
      toast({ title: "儲存失敗", description: NO_ROWS_AFFECTED_MESSAGE, variant: "destructive" });
      return;
    }
    const stored = ((data as any)?.gallery_urls ?? []) as string[];
    if (JSON.stringify(stored) !== JSON.stringify(snapshot.gallery_urls)) {
      toast({
        title: "相簿順序寫入異常",
        description: "資料庫回傳的順序與畫面不一致，請重新整理確認。",
        variant: "destructive",
      });
      return;
    }
    setSavedForm(snapshot);
    toast({ title: "已儲存團購頁民宿介紹", description: `相簿順序已寫入（${stored.length} 張）` });
  };


  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 載入中…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">團購頁民宿介紹</CardTitle>
        <div className="flex items-center gap-2">
          {(dirty || !savedForm) && (
            <Badge variant="destructive" className="text-xs">尚未儲存</Badge>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Switch
              checked={form.is_visible}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_visible: v }))}
            />
            <span className="text-muted-foreground">顯示於團購頁</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={syncFromOfficial}>
            <RefreshCw className="mr-1 h-4 w-4" /> 同步官網內容
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            儲存
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>民宿簡介</Label>
          <Textarea
            rows={5}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="團購頁上顯示的民宿介紹文字"
          />
        </div>

        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">設施與正式訂房須知已改由專屬模組維護</p>
          <p>
            團購頁的「設施與服務」讀取後台〈網站內容 → 設施與服務〉，「訂房須知」讀取〈網站內容 → 訂房須知〉，
            此處不再重複輸入（原有資料仍保留於資料庫，未被清除）。本區僅負責民宿簡介、入住前提醒、聯絡資訊與相簿。
          </p>
        </div>

        <div>
          <Label>入住前提醒（訂單成立後顯示）</Label>
          <Textarea
            rows={5}
            value={form.check_in_notice}
            onChange={(e) => setForm((f) => ({ ...f, check_in_notice: e.target.value }))}
            placeholder="例如：管家聯絡方式、抵達方式、門鎖／入住流程提醒"
          />
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            此內容僅顯示於客人的團購訂單查詢頁，適合填寫入住前才需要知道的補充資訊，例如管家聯絡方式、抵達方式、門鎖／入住流程、入住前提醒等。正式住宿規則請至「訂房須知」維護。
          </p>
        </div>



        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>聯絡電話</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div>
            <Label>地址</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <Label>相簿照片（團購頁輪播）</Label>
          <p className="mt-1 text-xs text-muted-foreground">拖曳縮圖可調整順序，第 1 張為封面。</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {form.gallery_urls.map((url, i) => (
              <div
                key={url + i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) movePhoto(dragIndex, i);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={`relative overflow-hidden rounded-md border transition-opacity ${
                  dragIndex === i ? "opacity-50" : ""
                }`}
              >
                <img src={url} alt="" className="aspect-[4/3] w-full object-cover" draggable={false} />
                <div className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-background/90 px-1.5 py-0.5 text-xs cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-3.5 w-3.5" />
                  {i + 1}
                </div>
                <button
                  type="button"
                  aria-label="移除照片"
                  onClick={() =>
                    setForm((f) => ({ ...f, gallery_urls: f.gallery_urls.filter((_, x) => x !== i) }))
                  }
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="absolute inset-x-1 bottom-1 flex justify-between">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-xs"
                    disabled={i === 0}
                    onClick={() => movePhoto(i, i - 1)}
                  >
                    ←
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-xs"
                    disabled={i === form.gallery_urls.length - 1}
                    onClick={() => movePhoto(i, i + 1)}
                  >
                    →
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 max-w-xs">
            <ImageUploadField
              value={newPhoto}
              pathPrefix={`${accommodationId}/group-buy-intro`}
              onChange={(url) => {
                if (url) {
                  setForm((f) => ({ ...f, gallery_urls: [...f.gallery_urls, url] }));
                  setNewPhoto(null);
                } else {
                  setNewPhoto(null);
                }
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">上傳後會加入相簿最後一張。</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default GroupBuyVenueIntroEditor;
