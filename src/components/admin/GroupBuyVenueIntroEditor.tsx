import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { useToast } from "@/hooks/use-toast";
import { fetchOfficialVenueIntro, htmlToPlainText } from "@/lib/groupBuyVenueIntro";
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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

    if (data) {
      const row = data as any;
      setForm({
        description: htmlToPlainText(row.description),
        facilities: (row.facilities ?? []).join("、"),
        check_in_notice: htmlToPlainText(row.check_in_notice),
        phone: row.phone ?? "",
        address: row.address ?? "",
        gallery_urls: row.gallery_urls ?? [],
        is_visible: row.is_visible ?? true,
      });
    } else {
      const official = await fetchOfficialVenueIntro(accommodationId);
      setForm({
        description: htmlToPlainText(official?.description),
        facilities: (official?.facilities ?? []).join("、"),
        check_in_notice: htmlToPlainText(official?.check_in_notice),
        phone: official?.phone ?? "",
        address: official?.address ?? "",
        gallery_urls: (official?.gallery_urls ?? []).slice(0, 12),
        is_visible: true,
      });
    }
    setLoading(false);
  }, [accommodationId]);

  useEffect(() => {
    load();
  }, [load]);

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
      check_in_notice: htmlToPlainText(official.check_in_notice),
      phone: official.phone ?? "",
      address: official.address ?? "",
      gallery_urls: official.gallery_urls.slice(0, 12),
    }));
    toast({ title: "已帶入官網內容", description: "請確認後按儲存。" });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("group_buy_venue_intros").upsert(
      {
        accommodation_id: accommodationId,
        description: form.description || null,
        facilities: form.facilities
          .split(/[、,，\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        check_in_notice: form.check_in_notice || null,
        phone: form.phone || null,
        address: form.address || null,
        gallery_urls: form.gallery_urls,
        is_visible: form.is_visible,
      } as any,
      { onConflict: "accommodation_id" },
    );
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已儲存團購頁民宿介紹" });
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

        <div>
          <Label>設施（以頓號或逗號分隔）</Label>
          <Textarea
            rows={3}
            value={form.facilities}
            onChange={(e) => setForm((f) => ({ ...f, facilities: e.target.value }))}
            placeholder="免費停車、Wi-Fi、寵物友善"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {form.facilities
              .split(/[、,，\n]/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((f, i) => (
                <Badge key={f + i} variant="secondary" className="text-xs">{f}</Badge>
              ))}
          </div>
        </div>

        <div>
          <Label>入住須知</Label>
          <Textarea
            rows={5}
            value={form.check_in_notice}
            onChange={(e) => setForm((f) => ({ ...f, check_in_notice: e.target.value }))}
          />
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
