import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, X, ImagePlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface RoomTypeFormProps {
  accommodationId: string;
  roomType?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

export function RoomTypeForm({ accommodationId, roomType, onSuccess, onCancel }: RoomTypeFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  
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
      loadPhotos();
    }
  }, [roomType]);

  const loadPhotos = async () => {
    if (!roomType?.id) return;

    const { data, error } = await supabase
      .from('room_photos')
      .select('photo_url')
      .eq('room_type_id', roomType.id)
      .order('display_order', { ascending: true });

    if (!error && data) {
      setPhotos(data.map(p => p.photo_url));
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + photos.length + newPhotos.length > 5) {
      toast({
        title: "照片數量限制",
        description: "最多只能上傳 5 張照片",
        variant: "destructive",
      });
      return;
    }
    setNewPhotos([...newPhotos, ...files]);
  };

  const removeNewPhoto = (index: number) => {
    setNewPhotos(newPhotos.filter((_, i) => i !== index));
  };

  const removeExistingPhoto = async (photoUrl: string) => {
    if (!roomType?.id) {
      setPhotos(photos.filter(p => p !== photoUrl));
      return;
    }

    const { error } = await supabase
      .from('room_photos')
      .delete()
      .eq('room_type_id', roomType.id)
      .eq('photo_url', photoUrl);

    if (error) {
      toast({
        title: "刪除失敗",
        description: "照片刪除失敗，請重試",
        variant: "destructive",
      });
    } else {
      setPhotos(photos.filter(p => p !== photoUrl));
      toast({
        title: "刪除成功",
        description: "照片已成功刪除",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const roomTypeData = {
        accommodation_id: accommodationId,
        name: formData.name,
        name_en: formData.name_en || null,
        description: formData.description || null,
        size_sqm: formData.size_sqm ? parseInt(formData.size_sqm) : null,
        capacity: parseInt(formData.capacity),
        room_count: parseInt(formData.room_count),
        weekday_price: parseInt(formData.weekday_price),
        weekend_price: parseInt(formData.weekend_price),
        base_price: parseInt(formData.weekday_price), // 保持相容性
        display_order: parseInt(formData.display_order),
      };

      let roomTypeId = roomType?.id;

      if (roomType) {
        // 更新現有房型
        const { error } = await supabase
          .from('room_types')
          .update(roomTypeData)
          .eq('id', roomType.id);

        if (error) throw error;
      } else {
        // 新增房型
        const { data, error } = await supabase
          .from('room_types')
          .insert(roomTypeData)
          .select()
          .single();

        if (error) throw error;
        roomTypeId = data.id;
      }

      // 上傳新照片
      if (newPhotos.length > 0 && roomTypeId) {
        for (let i = 0; i < newPhotos.length; i++) {
          const file = newPhotos[i];
          const fileExt = file.name.split('.').pop();
          const fileName = `${roomTypeId}-${Date.now()}-${i}.${fileExt}`;
          
          // 這裡暫時使用 URL.createObjectURL 作為示例
          // 實際應用中應該上傳到 Supabase Storage
          const photoUrl = URL.createObjectURL(file);

          await supabase
            .from('room_photos')
            .insert({
              room_type_id: roomTypeId,
              photo_url: photoUrl,
              display_order: photos.length + i,
            });
        }
      }

      toast({
        title: "儲存成功",
        description: roomType ? "房型已更新" : "房型已新增",
      });

      onSuccess();
    } catch (error) {
      console.error('Error saving room type:', error);
      toast({
        title: "儲存失敗",
        description: "請檢查所有欄位並重試",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{roomType ? "編輯房型" : "新增房型"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 物件名稱 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">物件名稱 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：豪華雙人房"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name_en">英文名稱</Label>
              <Input
                id="name_en"
                value={formData.name_en}
                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                placeholder="例如：Deluxe Double Room"
              />
            </div>
          </div>

          {/* 物件說明 */}
          <div className="space-y-2">
            <Label htmlFor="description">物件說明</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="請描述房型的特色與設施"
              rows={4}
            />
          </div>

          {/* 物件坪數、容納人數、房間數量 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="size_sqm">物件坪數（平方公尺）</Label>
              <Input
                id="size_sqm"
                type="number"
                value={formData.size_sqm}
                onChange={(e) => setFormData({ ...formData, size_sqm: e.target.value })}
                placeholder="30"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capacity">容納人數 *</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                placeholder="2"
                min="1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="room_count">房間數量 *</Label>
              <Input
                id="room_count"
                type="number"
                value={formData.room_count}
                onChange={(e) => setFormData({ ...formData, room_count: e.target.value })}
                placeholder="1"
                min="1"
                required
              />
            </div>
          </div>

          {/* 平日價格、假日價格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="weekday_price">平日價格 (NT$) *</Label>
              <Input
                id="weekday_price"
                type="number"
                value={formData.weekday_price}
                onChange={(e) => setFormData({ ...formData, weekday_price: e.target.value })}
                placeholder="3000"
                min="0"
                required
              />
              <p className="text-xs text-muted-foreground">週日至週四</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="weekend_price">假日價格 (NT$) *</Label>
              <Input
                id="weekend_price"
                type="number"
                value={formData.weekend_price}
                onChange={(e) => setFormData({ ...formData, weekend_price: e.target.value })}
                placeholder="4000"
                min="0"
                required
              />
              <p className="text-xs text-muted-foreground">週五、週六及國定假日</p>
            </div>
          </div>

          {/* 顯示順序 */}
          <div className="space-y-2">
            <Label htmlFor="display_order">顯示順序</Label>
            <Input
              id="display_order"
              type="number"
              value={formData.display_order}
              onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
              placeholder="0"
              min="0"
            />
            <p className="text-xs text-muted-foreground">數字越小排序越前面</p>
          </div>

          {/* 物件照片 */}
          <div className="space-y-4">
            <Label>物件照片（最多 5 張）</Label>
            
            {/* 現有照片 */}
            {photos.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {photos.map((photo, index) => (
                  <div key={index} className="relative group aspect-video bg-muted rounded-lg overflow-hidden">
                    <img src={photo} alt={`照片 ${index + 1}`} className="w-full h-full object-cover" />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                      onClick={() => removeExistingPhoto(photo)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* 新選擇的照片預覽 */}
            {newPhotos.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {newPhotos.map((file, index) => (
                  <div key={index} className="relative group aspect-video bg-muted rounded-lg overflow-hidden">
                    <img 
                      src={URL.createObjectURL(file)} 
                      alt={`新照片 ${index + 1}`} 
                      className="w-full h-full object-cover" 
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                      onClick={() => removeNewPhoto(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* 上傳按鈕 */}
            {photos.length + newPhotos.length < 5 && (
              <div>
                <input
                  type="file"
                  id="photo-upload"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <label htmlFor="photo-upload">
                  <Button type="button" variant="outline" className="w-full" asChild>
                    <span className="cursor-pointer flex items-center justify-center gap-2">
                      <ImagePlus className="h-4 w-4" />
                      選擇照片
                    </span>
                  </Button>
                </label>
              </div>
            )}
          </div>

          {/* 操作按鈕 */}
          <div className="flex gap-4 justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "儲存中..." : "儲存"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
