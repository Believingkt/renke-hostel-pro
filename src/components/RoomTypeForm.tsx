import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { ValidatedInput } from "@/components/ui/validated-input";
import { ValidatedTextarea } from "@/components/ui/validated-textarea";
import { ValidatedNumberInput } from "@/components/ui/validated-number-input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { roomTypeSchema } from "@/utils/roomValidation";
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
  const [errors, setErrors] = useState<Record<string, string>>({});
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

  const validateField = (field: string, value: string) => {
    const fieldSchema = roomTypeSchema.shape[field as keyof typeof roomTypeSchema.shape];
    if (fieldSchema) {
      try {
        fieldSchema.parse(value);
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[field];
          return newErrors;
        });
      } catch (error: any) {
        if (error.errors?.[0]) {
          setErrors(prev => ({ ...prev, [field]: error.errors[0].message }));
        }
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
    // 完整表單驗證
    const validationResult = roomTypeSchema.safeParse(formData);
    
    if (!validationResult.success) {
      const newErrors: Record<string, string> = {};
      validationResult.error.errors.forEach((err) => {
        if (err.path[0]) {
          newErrors[err.path[0].toString()] = err.message;
        }
      });
      setErrors(newErrors);
      toast.error('請修正表單錯誤後再試');
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const roomData = {
        accommodation_id: accommodationId,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        size_sqm: formData.size_sqm ? parseFloat(formData.size_sqm) : null,
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
    <div className="space-y-6">
      {/* 基本資訊 */}
      <Card>
        <CardHeader>
          <CardTitle>基本資訊</CardTitle>
          <CardDescription>設定房型的基本資訊</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ValidatedInput
            id="name"
            label="房型名稱"
            value={formData.name}
            onChange={(value) => {
              setFormData(prev => ({ ...prev, name: value }));
              validateField('name', value);
            }}
            onValidate={(value) => validateField('name', value)}
            error={errors.name}
            placeholder="例如：豪華雙人房"
            required
            showCharCount
            maxLength={50}
          />

          <ValidatedTextarea
            id="description"
            label="房型描述"
            value={formData.description}
            onChange={(value) => {
              setFormData(prev => ({ ...prev, description: value }));
              validateField('description', value);
            }}
            onValidate={(value) => validateField('description', value)}
            error={errors.description}
            placeholder="描述房型特色..."
            rows={3}
            showCharCount
            maxLength={500}
          />

          <div className="grid grid-cols-2 gap-4">
            <ValidatedNumberInput
              id="size_sqm"
              label="房間大小"
              value={formData.size_sqm ? parseInt(formData.size_sqm) : 0}
              onChange={(value) => {
                setFormData(prev => ({ ...prev, size_sqm: value.toString() }));
                validateField('size_sqm', value.toString());
              }}
              onValidate={(value) => validateField('size_sqm', value)}
              error={errors.size_sqm}
              suffix="平方公尺"
              min={0}
              max={1000}
            />

            <ValidatedNumberInput
              id="capacity"
              label="可入住人數"
              value={formData.capacity ? parseInt(formData.capacity) : 0}
              onChange={(value) => {
                setFormData(prev => ({ ...prev, capacity: value.toString() }));
                validateField('capacity', value.toString());
              }}
              onValidate={(value) => validateField('capacity', value)}
              error={errors.capacity}
              suffix="人"
              required
              min={1}
              max={20}
            />
          </div>
        </CardContent>
      </Card>

      {/* 房間數量 */}
      <Card>
        <CardHeader>
          <CardTitle>房間數量</CardTitle>
          <CardDescription>設定各種房型的數量</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <ValidatedNumberInput
              id="room_count"
              label="總房數"
              value={formData.room_count ? parseInt(formData.room_count) : 1}
              onChange={(value) => {
                setFormData(prev => ({ ...prev, room_count: value.toString() }));
                validateField('room_count', value.toString());
              }}
              onValidate={(value) => validateField('room_count', value)}
              error={errors.room_count}
              required
              min={1}
              max={100}
            />

            <ValidatedNumberInput
              id="quad_room_count"
              label="四人房數"
              value={formData.quad_room_count ? parseInt(formData.quad_room_count) : 0}
              onChange={(value) => {
                setFormData(prev => ({ ...prev, quad_room_count: value.toString() }));
                validateField('quad_room_count', value.toString());
              }}
              onValidate={(value) => validateField('quad_room_count', value)}
              error={errors.quad_room_count}
              min={0}
              max={100}
            />

            <ValidatedNumberInput
              id="double_room_count"
              label="雙人房數"
              value={formData.double_room_count ? parseInt(formData.double_room_count) : 0}
              onChange={(value) => {
                setFormData(prev => ({ ...prev, double_room_count: value.toString() }));
                validateField('double_room_count', value.toString());
              }}
              onValidate={(value) => validateField('double_room_count', value)}
              error={errors.double_room_count}
              min={0}
              max={100}
            />
          </div>
        </CardContent>
      </Card>

      {/* 定價設定 */}
      <Card>
        <CardHeader>
          <CardTitle>定價設定</CardTitle>
          <CardDescription>設定平日和假日的價格</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <Label>平日價格</Label>
            <div className="grid grid-cols-2 gap-4">
              <ValidatedNumberInput
                id="weekday_2_meals_price"
                label="平日一泊二食"
                value={formData.weekday_2_meals_price ? parseInt(formData.weekday_2_meals_price) : 0}
                onChange={(value) => {
                  setFormData(prev => ({ ...prev, weekday_2_meals_price: value.toString() }));
                  validateField('weekday_2_meals_price', value.toString());
                }}
                onValidate={(value) => validateField('weekday_2_meals_price', value)}
                error={errors.weekday_2_meals_price}
                prefix="NT$"
                min={0}
                max={100000}
              />

              <ValidatedNumberInput
                id="weekday_3_meals_price"
                label="平日一泊三食"
                value={formData.weekday_3_meals_price ? parseInt(formData.weekday_3_meals_price) : 0}
                onChange={(value) => {
                  setFormData(prev => ({ ...prev, weekday_3_meals_price: value.toString() }));
                  validateField('weekday_3_meals_price', value.toString());
                }}
                onValidate={(value) => validateField('weekday_3_meals_price', value)}
                error={errors.weekday_3_meals_price}
                prefix="NT$"
                min={0}
                max={100000}
              />
            </div>
          </div>

          <div className="space-y-4">
            <Label>假日價格</Label>
            <div className="grid grid-cols-2 gap-4">
              <ValidatedNumberInput
                id="weekend_2_meals_price"
                label="假日一泊二食"
                value={formData.weekend_2_meals_price ? parseInt(formData.weekend_2_meals_price) : 0}
                onChange={(value) => {
                  setFormData(prev => ({ ...prev, weekend_2_meals_price: value.toString() }));
                  validateField('weekend_2_meals_price', value.toString());
                }}
                onValidate={(value) => validateField('weekend_2_meals_price', value)}
                error={errors.weekend_2_meals_price}
                prefix="NT$"
                min={0}
                max={100000}
              />

              <ValidatedNumberInput
                id="weekend_3_meals_price"
                label="假日一泊三食"
                value={formData.weekend_3_meals_price ? parseInt(formData.weekend_3_meals_price) : 0}
                onChange={(value) => {
                  setFormData(prev => ({ ...prev, weekend_3_meals_price: value.toString() }));
                  validateField('weekend_3_meals_price', value.toString());
                }}
                onValidate={(value) => validateField('weekend_3_meals_price', value)}
                error={errors.weekend_3_meals_price}
                prefix="NT$"
                min={0}
                max={100000}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 顯示順序 */}
      <Card>
        <CardHeader>
          <CardTitle>顯示順序</CardTitle>
          <CardDescription>設定房型在網站上的顯示順序</CardDescription>
        </CardHeader>
        <CardContent>
          <ValidatedNumberInput
            id="display_order"
            label="顯示順序"
            value={formData.display_order ? parseInt(formData.display_order) : 0}
            onChange={(value) => {
              setFormData(prev => ({ ...prev, display_order: value.toString() }));
              validateField('display_order', value.toString());
            }}
            onValidate={(value) => validateField('display_order', value)}
            error={errors.display_order}
            min={0}
            max={100}
          />
          <p className="text-xs text-muted-foreground mt-2">
            數字越小，顯示越前面
          </p>
        </CardContent>
      </Card>

      {/* 房間照片 */}
      <Card>
        <CardHeader>
          <CardTitle>房間照片</CardTitle>
          <CardDescription>上傳並管理房間照片（可拖曳調整順序）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('room-photo-upload')?.click()}
              disabled={uploading}
            >
              <Plus className="h-4 w-4 mr-2" />
              {uploading ? "上傳中..." : "上傳照片"}
            </Button>
            <input
              id="room-photo-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {photoUrls.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={photoUrls} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {photoUrls.map((url, index) => (
                    <SortablePhotoItem
                      key={url}
                      url={url}
                      index={index}
                      onRemove={() => {
                        setPhotoUrls(photoUrls.filter((_, i) => i !== index));
                        toast.success("已移除照片");
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* 操作按鈕 */}
      <SaveButtonContainer
        onSave={handleSave}
        isSaving={isLoading}
      >
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          取消
        </Button>
      </SaveButtonContainer>
    </div>
  );
}
