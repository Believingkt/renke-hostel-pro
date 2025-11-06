import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RoomTypeFormProps {
  accommodationId: string;
  roomType?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

export function RoomTypeForm({ accommodationId, roomType, onSuccess, onCancel }: RoomTypeFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    name_en: "",
    description: "",
    size_sqm: "",
    capacity: "",
    room_count: "1",
    weekday_price: "",
    weekend_price: "",
    display_order: "0",
  });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState<boolean[]>([]);

  useEffect(() => {
    if (roomType) {
      setFormData({
        name: roomType.name || "",
        name_en: roomType.name_en || "",
        description: roomType.description || "",
        size_sqm: roomType.size_sqm?.toString() || "",
        capacity: roomType.capacity?.toString() || "",
        room_count: roomType.room_count?.toString() || "1",
        weekday_price: roomType.weekday_price?.toString() || "",
        weekend_price: roomType.weekend_price?.toString() || "",
        display_order: roomType.display_order?.toString() || "0",
      });
      loadPhotos(roomType.id);
    }
  }, [roomType]);

  const loadPhotos = async (roomTypeId: string) => {
    try {
      const { data } = await supabase
        .from("room_photos")
        .select("photo_url")
        .eq("room_type_id", roomTypeId)
        .order("display_order", { ascending: true });
      setPhotoUrls(data?.map(p => p.photo_url) || []);
    } catch (error) {
      console.error("Error loading photos:", error);
    }
  };

  const handleFileUpload = async (file: File, index: number) => {
    if (!file) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    setUploadingPhotos(prev => {
      const newState = [...prev];
      newState[index] = true;
      return newState;
    });

    try {
      const { error: uploadError } = await supabase.storage
        .from('room-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('room-photos')
        .getPublicUrl(filePath);

      const newUrls = [...photoUrls];
      newUrls[index] = publicUrl;
      setPhotoUrls(newUrls);

      toast.success("照片上傳成功");
    } catch (error: any) {
      toast.error("照片上傳失敗：" + error.message);
    } finally {
      setUploadingPhotos(prev => {
        const newState = [...prev];
        newState[index] = false;
        return newState;
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.capacity || !formData.room_count) {
      toast.error("請填寫必填欄位");
      return;
    }

    setIsLoading(true);
    try {
      const roomData = {
        accommodation_id: accommodationId,
        name: formData.name.trim(),
        name_en: formData.name_en.trim() || null,
        description: formData.description.trim() || null,
        size_sqm: formData.size_sqm ? parseInt(formData.size_sqm) : null,
        capacity: parseInt(formData.capacity),
        room_count: parseInt(formData.room_count),
        weekday_price: formData.weekday_price ? parseInt(formData.weekday_price) : null,
        weekend_price: formData.weekend_price ? parseInt(formData.weekend_price) : null,
        base_price: formData.weekday_price ? parseInt(formData.weekday_price) : 0,
        display_order: parseInt(formData.display_order) || 0,
      };

      let roomId: string;
      if (roomType) {
        await supabase.from("room_types").update(roomData).eq("id", roomType.id);
        roomId = roomType.id;
        await supabase.from("room_photos").delete().eq("room_type_id", roomId);
      } else {
        const { data } = await supabase.from("room_types").insert(roomData).select().single();
        roomId = data!.id;
      }

      if (photoUrls.length > 0) {
        const photosToInsert = photoUrls.filter(url => url.trim()).map((url, index) => ({
          room_type_id: roomId,
          photo_url: url.trim(),
          display_order: index,
        }));
        if (photosToInsert.length > 0) {
          await supabase.from("room_photos").insert(photosToInsert);
        }
      }

      toast.success(roomType ? "房型已更新" : "房型已新增");
      onSuccess();
    } catch (error: any) {
      toast.error("儲存失敗：" + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{roomType ? "編輯房型" : "新增房型"}</CardTitle>
        <CardDescription>填寫房型的詳細資訊</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>物件名稱 *</Label>
          <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="例：豪華雙人房" />
        </div>
        <div className="space-y-2">
          <Label>英文名稱</Label>
          <Input value={formData.name_en} onChange={(e) => setFormData({ ...formData, name_en: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>物件說明</Label>
          <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>物件坪數 (m²)</Label>
            <Input type="number" value={formData.size_sqm} onChange={(e) => setFormData({ ...formData, size_sqm: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>容納人數 *</Label>
            <Input type="number" value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>房間數量 *</Label>
          <Input type="number" value={formData.room_count} onChange={(e) => setFormData({ ...formData, room_count: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>平日價格</Label>
            <Input type="number" value={formData.weekday_price} onChange={(e) => setFormData({ ...formData, weekday_price: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>假日價格</Label>
            <Input type="number" value={formData.weekend_price} onChange={(e) => setFormData({ ...formData, weekend_price: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>物件照片</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setPhotoUrls([...photoUrls, ""])}><Plus className="h-4 w-4" /></Button>
          </div>
          {photoUrls.map((url, i) => (
            <div key={i} className="space-y-2">
              <div className="flex gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, i);
                  }}
                  disabled={uploadingPhotos[i]}
                  className="flex-1"
                />
                <Button variant="outline" size="icon" onClick={() => setPhotoUrls(photoUrls.filter((_, idx) => idx !== i))} disabled={uploadingPhotos[i]}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {url && (
                <div className="relative w-full h-32 rounded-md overflow-hidden border">
                  <img src={url} alt={`預覽 ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              )}
              {uploadingPhotos[i] && <p className="text-sm text-muted-foreground">上傳中...</p>}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button onClick={handleSave} disabled={isLoading}>{isLoading ? "儲存中..." : "儲存"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
