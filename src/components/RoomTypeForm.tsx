import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface RoomTypeFormProps {
  accommodationId: string;
  roomType?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

interface SortablePhotoItemProps {
  url: string;
  index: number;
  onRemove: () => void;
}

function SortablePhotoItem({ url, index, onRemove }: SortablePhotoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: url });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group aspect-square overflow-hidden rounded-lg border bg-background"
    >
      <img
        src={url}
        alt={`照片 ${index + 1}`}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
        順序: {index + 1}
      </div>
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 cursor-grab active:cursor-grabbing bg-white/90 hover:bg-white rounded-lg p-2 transition-colors"
      >
        <GripVertical className="h-4 w-4 text-gray-700" />
      </div>
    </div>
  );
}

export function RoomTypeForm({ accommodationId, roomType, onSuccess, onCancel }: RoomTypeFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    size_sqm: "",
    capacity: "",
    room_count: "1",
    quad_room_count: "0",
    double_room_count: "0",
    weekday_2_meals_price: "",
    weekday_3_meals_price: "",
    weekend_2_meals_price: "",
    weekend_3_meals_price: "",
    display_order: "0",
  });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (roomType) {
      setFormData({
        name: roomType.name || "",
        description: roomType.description || "",
        size_sqm: roomType.size_sqm?.toString() || "",
        capacity: roomType.capacity?.toString() || "",
        room_count: roomType.room_count?.toString() || "1",
        quad_room_count: roomType.quad_room_count?.toString() || "0",
        double_room_count: roomType.double_room_count?.toString() || "0",
        weekday_2_meals_price: roomType.weekday_2_meals_price?.toString() || "",
        weekday_3_meals_price: roomType.weekday_3_meals_price?.toString() || "",
        weekend_2_meals_price: roomType.weekend_2_meals_price?.toString() || "",
        weekend_3_meals_price: roomType.weekend_3_meals_price?.toString() || "",
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
      if (import.meta.env.DEV) {
        console.error("Error loading photos:", error);
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = fileName;

        const { error } = await supabase.storage
          .from('room-photos')
          .upload(filePath, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('room-photos')
          .getPublicUrl(filePath);

        uploadedUrls.push(publicUrl);
      }

      setPhotoUrls([...photoUrls, ...uploadedUrls]);
      toast.success(`已上傳 ${uploadedUrls.length} 張照片`);
    } catch (error: any) {
      toast.error("上傳失敗：" + error.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPhotoUrls((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
      toast.success("照片順序已更新");
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
        description: formData.description.trim() || null,
        size_sqm: formData.size_sqm ? parseInt(formData.size_sqm) : null,
        capacity: parseInt(formData.capacity),
        room_count: parseInt(formData.room_count),
        quad_room_count: parseInt(formData.quad_room_count) || null,
        triple_room_count: 0,
        double_room_count: parseInt(formData.double_room_count) || null,
        weekday_2_meals_price: formData.weekday_2_meals_price ? parseInt(formData.weekday_2_meals_price) : null,
        weekday_3_meals_price: formData.weekday_3_meals_price ? parseInt(formData.weekday_3_meals_price) : null,
        weekend_2_meals_price: formData.weekend_2_meals_price ? parseInt(formData.weekend_2_meals_price) : null,
        weekend_3_meals_price: formData.weekend_3_meals_price ? parseInt(formData.weekend_3_meals_price) : null,
        base_price: formData.weekday_2_meals_price ? parseInt(formData.weekday_2_meals_price) : 0,
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
          <Label>名稱 *</Label>
          <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="例：豪華雙人房" />
        </div>
        <div className="space-y-2">
          <Label>說明</Label>
          <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>坪數 (m²)</Label>
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
        
        {/* 房型間數設定 */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">房型間數設定</Label>
          <div className="grid grid-cols-2 gap-4 pl-4">
            <div className="space-y-2">
              <Label>四人房</Label>
              <Input 
                type="number" 
                min="0"
                value={formData.quad_room_count} 
                onChange={(e) => setFormData({ ...formData, quad_room_count: e.target.value })} 
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>雙人房</Label>
              <Input 
                type="number" 
                min="0"
                value={formData.double_room_count} 
                onChange={(e) => setFormData({ ...formData, double_room_count: e.target.value })} 
                placeholder="0"
              />
            </div>
          </div>
        </div>
        
        {/* 平日價格 */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">平日價格</Label>
          <div className="grid grid-cols-2 gap-4 pl-4">
            <div className="space-y-2">
              <Label>一泊二食</Label>
              <Input 
                type="number" 
                value={formData.weekday_2_meals_price} 
                onChange={(e) => setFormData({ ...formData, weekday_2_meals_price: e.target.value })} 
                placeholder="輸入價格"
              />
            </div>
            <div className="space-y-2">
              <Label>一泊三食</Label>
              <Input 
                type="number" 
                value={formData.weekday_3_meals_price} 
                onChange={(e) => setFormData({ ...formData, weekday_3_meals_price: e.target.value })} 
                placeholder="輸入價格"
              />
            </div>
          </div>
        </div>

        {/* 假日價格 */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">假日價格</Label>
          <div className="grid grid-cols-2 gap-4 pl-4">
            <div className="space-y-2">
              <Label>一泊二食</Label>
              <Input 
                type="number" 
                value={formData.weekend_2_meals_price} 
                onChange={(e) => setFormData({ ...formData, weekend_2_meals_price: e.target.value })} 
                placeholder="輸入價格"
              />
            </div>
            <div className="space-y-2">
              <Label>一泊三食</Label>
              <Input 
                type="number" 
                value={formData.weekend_3_meals_price} 
                onChange={(e) => setFormData({ ...formData, weekend_3_meals_price: e.target.value })} 
                placeholder="輸入價格"
              />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>物件照片 {photoUrls.length > 0 && `(${photoUrls.length})`}</Label>
            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => document.getElementById('photo-upload')?.click()}
                disabled={uploading}
              >
                <Plus className="h-4 w-4 mr-1" />
                {uploading ? "上傳中..." : "選擇照片"}
              </Button>
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          </div>
          {photoUrls.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">拖曳照片可調整順序</p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={photoUrls} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {photoUrls.map((url, i) => (
                      <SortablePhotoItem
                        key={url}
                        url={url}
                        index={i}
                        onRemove={() => setPhotoUrls(photoUrls.filter((_, idx) => idx !== i))}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
        <SaveButtonContainer 
          onSave={handleSave} 
          isSaving={isLoading}
          saveText="儲存變更"
        >
          <Button variant="outline" onClick={onCancel}>取消</Button>
        </SaveButtonContainer>
      </CardContent>
    </Card>
  );
}
