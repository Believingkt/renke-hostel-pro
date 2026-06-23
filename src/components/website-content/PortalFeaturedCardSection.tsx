import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Upload, Trash2, Sparkles, Image as ImageIcon } from "lucide-react";
import { compressImage, validateImageFile } from "@/utils/imageCompression";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface CardSettings {
  display_name: string;
  location_override: string;
  editor_pick_title: string;
  editor_pick_body: string;
  cta_label: string;
  is_visible: boolean;
}

interface Photo {
  id: string;
  photo_url: string;
  display_order: number;
}

const DEFAULTS: CardSettings = {
  display_name: "",
  location_override: "",
  editor_pick_title: "管家推薦 · Editor's Pick",
  editor_pick_body: "",
  cta_label: "探索這間民宿",
  is_visible: true,
};

interface Props {
  accommodationId: string | null;
}

function SortablePhoto({ photo, onDelete }: { photo: Photo; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative group rounded-lg overflow-hidden border bg-muted aspect-[4/3]">
      <img src={photo.photo_url} alt="精選卡片照片" className="w-full h-full object-cover" {...attributes} {...listeners} />
      <button
        type="button"
        onClick={() => onDelete(photo.id)}
        className="absolute top-2 right-2 h-8 w-8 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

const PortalFeaturedCardSection = ({ accommodationId }: Props) => {
  const [settings, setSettings] = useState<CardSettings>(DEFAULTS);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!accommodationId) return;
    void load();
  }, [accommodationId]);

  const load = async () => {
    if (!accommodationId) return;
    setLoading(true);
    try {
      const [{ data: row }, { data: pics }] = await Promise.all([
        (supabase as any)
          .from("portal_featured_cards")
          .select("*")
          .eq("accommodation_id", accommodationId)
          .maybeSingle(),
        (supabase as any)
          .from("portal_featured_card_photos")
          .select("id, photo_url, display_order")
          .eq("accommodation_id", accommodationId)
          .order("display_order", { ascending: true }),
      ]);
      if (row) {
        setSettings({
          display_name: row.display_name ?? "",
          location_override: row.location_override ?? "",
          editor_pick_title: row.editor_pick_title ?? DEFAULTS.editor_pick_title,
          editor_pick_body: row.editor_pick_body ?? "",
          cta_label: row.cta_label ?? DEFAULTS.cta_label,
          is_visible: row.is_visible ?? true,
        });
      } else {
        setSettings(DEFAULTS);
      }
      setPhotos(pics ?? []);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!accommodationId) return;
    setSaving(true);
    try {
      const payload = {
        accommodation_id: accommodationId,
        display_name: settings.display_name.trim() || null,
        location_override: settings.location_override.trim() || null,
        editor_pick_title: settings.editor_pick_title.trim() || null,
        editor_pick_body: settings.editor_pick_body.trim() || null,
        cta_label: settings.cta_label.trim() || null,
        is_visible: settings.is_visible,
      };
      const { error } = await (supabase as any)
        .from("portal_featured_cards")
        .upsert(payload, { onConflict: "accommodation_id" });
      if (error) throw error;
      toast.success("精選卡片設定已儲存");
    } catch (e: any) {
      toast.error("儲存失敗：" + (e?.message ?? "未知錯誤"));
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!accommodationId || !e.target.files?.length) return;
    const files = Array.from(e.target.files);
    setUploading(true);
    let nextOrder = photos.length > 0 ? Math.max(...photos.map((p) => p.display_order)) : 0;
    const added: Photo[] = [];
    try {
      for (const file of files) {
        const v = validateImageFile(file, 10 * 1024 * 1024);
        if (!v.valid) {
          toast.error(`${file.name}: ${v.error}`);
          continue;
        }
        const { blob } = await compressImage(file, { maxWidth: 1600, maxHeight: 1200, quality: 0.85 });
        const fileName = `featured-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
        const filePath = `${accommodationId}/${fileName}`;
        const { error: upErr } = await supabase.storage
          .from("room-photos")
          .upload(filePath, blob, { contentType: "image/webp", cacheControl: "3600" });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from("room-photos").getPublicUrl(filePath);
        nextOrder++;
        const { data: row, error: insErr } = await (supabase as any)
          .from("portal_featured_card_photos")
          .insert([{ accommodation_id: accommodationId, photo_url: publicUrl, display_order: nextOrder }])
          .select("id, photo_url, display_order")
          .single();
        if (insErr) throw insErr;
        added.push(row);
      }
      if (added.length) {
        setPhotos((prev) => [...prev, ...added]);
        toast.success(`已上傳 ${added.length} 張照片`);
      }
    } catch (err: any) {
      toast.error("上傳失敗：" + (err?.message ?? "未知錯誤"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    const ok = window.confirm("確認刪除這張照片？");
    if (!ok) return;
    try {
      const { error } = await (supabase as any).from("portal_featured_card_photos").delete().eq("id", id);
      if (error) throw error;
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      toast.success("已刪除");
    } catch (e: any) {
      toast.error("刪除失敗：" + (e?.message ?? "未知錯誤"));
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = photos.findIndex((p) => p.id === active.id);
    const newIdx = photos.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(photos, oldIdx, newIdx).map((p, i) => ({ ...p, display_order: i + 1 }));
    setPhotos(reordered);
    try {
      await Promise.all(
        reordered.map((p) =>
          (supabase as any).from("portal_featured_card_photos").update({ display_order: p.display_order }).eq("id", p.id)
        )
      );
    } catch (err: any) {
      toast.error("排序儲存失敗");
    }
  };

  if (!accommodationId) {
    return <p className="text-sm text-muted-foreground">請先選擇旅宿</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-semibold">精選民宿卡片</h2>
          <p className="text-sm text-muted-foreground">
            獨立管理 Portal 首頁「精選民宿」區塊中此民宿卡片的照片、名稱、地點、管家推薦與按鈕文字。
          </p>
        </div>
      </div>

      {/* 顯示開關 */}
      <Card>
        <CardContent className="pt-6 flex items-center justify-between">
          <div>
            <Label className="text-base">在 Portal 首頁顯示這張卡片</Label>
            <p className="text-xs text-muted-foreground mt-1">關閉後，這間民宿不會出現在「精選民宿」區塊</p>
          </div>
          <Switch
            checked={settings.is_visible}
            onCheckedChange={(v) => setSettings((s) => ({ ...s, is_visible: v }))}
          />
        </CardContent>
      </Card>

      {/* 卡片照片 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>卡片輪播照片</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              手機卡片可左右滑動的圖片。未上傳時，自動使用首頁輪播 (Hero) 照片。
            </p>
          </div>
          <Button onClick={() => document.getElementById("featured-card-upload")?.click()} disabled={uploading} className="gap-2">
            <Upload className="h-4 w-4" />
            {uploading ? "上傳中..." : "上傳照片"}
          </Button>
          <input
            id="featured-card-upload"
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed rounded-lg">
              <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">尚未上傳，將自動使用首頁輪播 Hero 照片</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {photos.map((p) => (
                    <SortablePhoto key={p.id} photo={p} onDelete={handleDelete} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* 文字設定 */}
      <Card>
        <CardHeader>
          <CardTitle>文字內容</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>顯示名稱（覆寫）</Label>
            <Input
              value={settings.display_name}
              onChange={(e) => setSettings((s) => ({ ...s, display_name: e.target.value }))}
              placeholder="留空則使用民宿原始名稱"
            />
          </div>
          <div>
            <Label>地點文字（覆寫）</Label>
            <Input
              value={settings.location_override}
              onChange={(e) => setSettings((s) => ({ ...s, location_override: e.target.value }))}
              placeholder="例：宜蘭 · 冬山（留空則使用區域欄位）"
            />
          </div>
          <div>
            <Label>管家推薦標題</Label>
            <Input
              value={settings.editor_pick_title}
              onChange={(e) => setSettings((s) => ({ ...s, editor_pick_title: e.target.value }))}
              placeholder="管家推薦 · Editor's Pick"
            />
          </div>
          <div>
            <Label>管家推薦內文</Label>
            <Textarea
              rows={5}
              value={settings.editor_pick_body}
              onChange={(e) => setSettings((s) => ({ ...s, editor_pick_body: e.target.value }))}
              placeholder="專業旅遊編輯口吻，介紹這間民宿的獨特之處（建議 60–120 字）"
            />
          </div>
          <div>
            <Label>按鈕文字</Label>
            <Input
              value={settings.cta_label}
              onChange={(e) => setSettings((s) => ({ ...s, cta_label: e.target.value }))}
              placeholder="探索這間民宿"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || loading} size="lg">
          {saving ? "儲存中..." : "儲存設定"}
        </Button>
      </div>
    </div>
  );
};

export default PortalFeaturedCardSection;
