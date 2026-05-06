import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical, Info, Check } from "lucide-react";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { ValidatedInput } from "@/components/ui/validated-input";
import { ValidatedTextarea } from "@/components/ui/validated-textarea";
import { ValidatedNumberInput } from "@/components/ui/validated-number-input";
import { DraftRestoreBanner } from "@/components/ui/draft-restore-banner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { roomTypeSchema } from "@/utils/roomValidation";
import { useFormDraft } from "@/hooks/use-form-draft";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
          variant="ghost-destructive"
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
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [exclusivePackages, setExclusivePackages] = useState<Array<{ id: string; name: string }>>([]);

  // 記住「進入編輯時」的房間數量，避免儲存時 roomType 已被外層 state 更新而比對不到差異
  const originalRoomCountRef = useRef<number | null>(roomType?.room_count ?? null);

  const initialFormData = {
    name: "",
    description: "",
    size_sqm: "",
    capacity: "",
    room_count: "1",
    is_exclusive_package: false,
    is_bound_to_exclusive: false,
    bound_exclusive_ids: [] as string[],
    bind_all_exclusives: true, // 預設綁定全部
  };

  const {
    formData,
    setFormData,
    hasDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  } = useFormDraft({
    key: `room-type-form-${roomType?.id || 'new'}`,
    initialData: initialFormData,
    onRestore: (data) => {
      // 草稿恢復時不覆蓋照片
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 載入包棟房型列表
  useEffect(() => {
    const loadExclusivePackages = async () => {
      const { data } = await supabase
        .from("room_types")
        .select("id, name")
        .eq("accommodation_id", accommodationId)
        .eq("is_exclusive_package", true)
        .order("display_order", { ascending: true });
      
      // 編輯時排除當前房型
      const filtered = roomType?.id 
        ? (data || []).filter(r => r.id !== roomType.id)
        : (data || []);
      setExclusivePackages(filtered);
    };
    loadExclusivePackages();
  }, [accommodationId, roomType?.id]);

  useEffect(() => {
    if (roomType) {
      originalRoomCountRef.current = roomType.room_count ?? null;
      const boundIds = roomType.bound_exclusive_ids || [];
      setFormData({
        name: roomType.name || "",
        description: roomType.description || "",
        size_sqm: roomType.size_sqm?.toString() || "",
        capacity: roomType.capacity?.toString() || "",
        room_count: roomType.room_count?.toString() || "1",
        is_exclusive_package: roomType.is_exclusive_package || false,
        is_bound_to_exclusive: roomType.is_bound_to_exclusive || false,
        bound_exclusive_ids: boundIds,
        bind_all_exclusives: boundIds.length === 0, // 空陣列表示綁定全部
      });
      loadPhotos(roomType.id);
      // 編輯模式時清除草稿，避免顯示草稿恢復提示
      clearDraft();
    }
  }, [roomType, setFormData, clearDraft]);


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
      const { validateImageUpload } = await import("@/utils/imageUploadValidation");

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const validation = await validateImageUpload(file);
        if (validation.ok === false) {
          toast.error(`${file.name}：${validation.reason}`);
          continue;
        }
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        // RLS 政策要求路徑格式為 accommodation_id/filename
        const filePath = `${accommodationId}/${fileName}`;

        const { error } = await supabase.storage
          .from('room-photos')
          .upload(filePath, file, { contentType: validation.mime });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('room-photos')
          .getPublicUrl(filePath);

        uploadedUrls.push(publicUrl);
      }

      if (uploadedUrls.length > 0) {
        setPhotoUrls([...photoUrls, ...uploadedUrls]);
        toast.success(`已上傳 ${uploadedUrls.length} 張照片`);
      }
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
      let displayOrder = roomType?.display_order || 0;
      
      // 如果是新增房型，自動設定為最大順序 + 1
      if (!roomType) {
        const { data: maxOrderData } = await supabase
          .from("room_types")
          .select("display_order")
          .eq("accommodation_id", accommodationId)
          .order("display_order", { ascending: false })
          .limit(1)
          .single();
        
        displayOrder = (maxOrderData?.display_order || 0) + 1;
      }

      const roomData = {
        accommodation_id: accommodationId,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        size_sqm: formData.size_sqm ? parseInt(formData.size_sqm) : null,
        capacity: parseInt(formData.capacity),
        room_count: formData.room_count ? parseInt(formData.room_count) : null,
        base_price: 0,
        display_order: displayOrder,
        is_exclusive_package: formData.is_exclusive_package,
        is_bound_to_exclusive: formData.is_bound_to_exclusive,
        // 只有在「房間 + 綁定包棟」且選擇個別包棟時才儲存 ID 列表
        bound_exclusive_ids: (!formData.is_exclusive_package && formData.is_bound_to_exclusive && !formData.bind_all_exclusives)
          ? formData.bound_exclusive_ids
          : [],
      };

      let savedRoomId = roomType?.id;

      if (roomType) {
        const { error } = await supabase
          .from("room_types")
          .update(roomData)
          .eq("id", roomType.id);
        if (error) throw error;
        
        // 若房間數量有變更，同步更新庫存表
        const newRoomCount = roomData.room_count;
        const oldRoomCount = originalRoomCountRef.current;

        if (newRoomCount != null && oldRoomCount != null && newRoomCount !== oldRoomCount) {
          // 變更規則：
          // - 若變小：把庫存中「大於新房數」的數字降到新值（避免出現超過上限的庫存）
          // - 若變大：僅把「等於舊房數」的列更新成新值（保留手動調整過的日期）
          const inventoryUpdateQuery =
            newRoomCount < oldRoomCount
              ? supabase
                  .from("room_inventory_pricing")
                  .update({ available_rooms: newRoomCount })
                  .eq("room_type_id", roomType.id)
                  .gt("available_rooms", newRoomCount)
              : supabase
                  .from("room_inventory_pricing")
                  .update({ available_rooms: newRoomCount })
                  .eq("room_type_id", roomType.id)
                  .eq("available_rooms", oldRoomCount);

          const { error: inventoryError } = await inventoryUpdateQuery;
          if (inventoryError) throw inventoryError;

          originalRoomCountRef.current = newRoomCount;
        }
      } else {
        const { data, error } = await supabase
          .from("room_types")
          .insert(roomData)
          .select()
          .single();
        if (error) throw error;
        savedRoomId = data.id;
      }

      // 儲存照片
      if (savedRoomId && photoUrls.length > 0) {
        // 刪除舊照片
        await supabase
          .from("room_photos")
          .delete()
          .eq("room_type_id", savedRoomId);

        // 插入新照片
        const photoInserts = photoUrls.map((url, index) => ({
          room_type_id: savedRoomId,
          photo_url: url,
          display_order: index,
        }));

        const { error: photoError } = await supabase
          .from("room_photos")
          .insert(photoInserts);

        if (photoError) throw photoError;
      }

      toast.success(roomType ? '房型已更新' : '房型已新增');
      clearDraft();
      onSuccess();
    } catch (error: any) {
      toast.error('儲存失敗：' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    clearDraft(); // 取消時清除草稿
    onCancel();
  };

  return (
    <div className="space-y-6">
      {hasDraft && !roomType && (
        <DraftRestoreBanner
          onRestore={restoreDraft}
          onDiscard={discardDraft}
        />
      )}
      
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
            rows={4}
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
              suffix="坪"
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

      {/* 房型數量 */}
      <Card>
        <CardHeader>
          <CardTitle>房型數量</CardTitle>
          <CardDescription>設定此房型可用數量，此數量將作為房價庫存日曆的預設庫存</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <ValidatedNumberInput
              id="room_count"
              label="房型數量"
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
          </div>
        </CardContent>
      </Card>

      {/* 房間單位管理：僅在編輯既有房型且非包棟時顯示 */}
      {roomType?.id && !formData.is_exclusive_package && (
        <RoomUnitsManager
          roomTypeId={roomType.id}
          accommodationId={accommodationId}
          roomCount={parseInt(formData.room_count) || 0}
        />
      )}

      {/* 關聯設定 */}
      <Card>
        <CardHeader>
          <CardTitle>關聯設定</CardTitle>
          <CardDescription>設定此房型與其他房型的預訂關聯邏輯</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 主要類型選擇：包棟 or 房間 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-base font-medium">房型類型</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>選擇此房型是「包棟」類型還是「房間」類型，再進一步設定關聯邏輯。</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <RadioGroup
              value={formData.is_exclusive_package ? "exclusive" : "room"}
              onValueChange={(value) => {
                if (value === "exclusive") {
                  setFormData(prev => ({ 
                    ...prev, 
                    is_exclusive_package: true,
                    is_bound_to_exclusive: false // 預設為獨立包棟
                  }));
                } else {
                  setFormData(prev => ({ 
                    ...prev, 
                    is_exclusive_package: false,
                    is_bound_to_exclusive: false // 預設為獨立房間
                  }));
                }
              }}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="exclusive" id="type-exclusive" />
                <Label htmlFor="type-exclusive" className="cursor-pointer">包棟</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="room" id="type-room" />
                <Label htmlFor="type-room" className="cursor-pointer">房間</Label>
              </div>
            </RadioGroup>
          </div>

          {/* 次要選擇：根據主要類型顯示不同選項 */}
          {formData.is_exclusive_package ? (
            <div className="space-y-3 pl-4 border-l-2 border-primary/20">
              <div className="flex items-center gap-2">
                <Label className="text-base font-medium">包棟類型</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>獨立包棟：預訂後不影響其他房型。<br/>共用包棟：預訂後會鎖定其他共用包棟及綁定包棟的房型。</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <RadioGroup
                value={formData.is_bound_to_exclusive ? "shared" : "independent"}
                onValueChange={(value) => {
                  setFormData(prev => ({ 
                    ...prev, 
                    is_bound_to_exclusive: value === "shared"
                  }));
                }}
                className="space-y-2"
              >
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="independent" id="exclusive-independent" className="mt-1" />
                  <div>
                    <Label htmlFor="exclusive-independent" className="cursor-pointer font-medium">獨立包棟</Label>
                    <p className="text-sm text-muted-foreground">預訂後不會鎖定其他包棟/綁定包棟的房型</p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="shared" id="exclusive-shared" className="mt-1" />
                  <div>
                    <Label htmlFor="exclusive-shared" className="cursor-pointer font-medium">共用包棟</Label>
                    <p className="text-sm text-muted-foreground">預訂後會鎖定其他共用包棟及綁定包棟的房型</p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          ) : (
            <div className="space-y-3 pl-4 border-l-2 border-primary/20">
              <div className="flex items-center gap-2">
                <Label className="text-base font-medium">房間類型</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>獨立房間：預訂後不影響其他房型。<br/>綁定包棟：與共用包棟互相鎖定。</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <RadioGroup
                value={formData.is_bound_to_exclusive ? "bound" : "independent"}
                onValueChange={(value) => {
                  setFormData(prev => ({ 
                    ...prev, 
                    is_bound_to_exclusive: value === "bound",
                    bind_all_exclusives: true, // 切換時重設為全部
                    bound_exclusive_ids: [],
                  }));
                }}
                className="space-y-2"
              >
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="independent" id="room-independent" className="mt-1" />
                  <div>
                    <Label htmlFor="room-independent" className="cursor-pointer font-medium">獨立房間</Label>
                    <p className="text-sm text-muted-foreground">預訂後不會鎖定其他包棟/綁定包棟的房型</p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="bound" id="room-bound" className="mt-1" />
                  <div>
                    <Label htmlFor="room-bound" className="cursor-pointer font-medium">綁定包棟</Label>
                    <p className="text-sm text-muted-foreground">當此房型被預訂時，共用包棟無法預訂；當共用包棟被預訂時，此房型也無法預訂</p>
                  </div>
                </div>
              </RadioGroup>

              {/* 綁定包棟選擇：當選擇「綁定包棟」時顯示 */}
              {formData.is_bound_to_exclusive && exclusivePackages.length > 0 && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">選擇綁定的包棟房型</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>選擇此房間要綁定哪些包棟房型。選擇「全部包棟」表示與所有共用包棟互相鎖定。</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  
                  {/* 全部選項 */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="bind-all"
                      checked={formData.bind_all_exclusives}
                      onCheckedChange={(checked) => {
                        setFormData(prev => ({
                          ...prev,
                          bind_all_exclusives: !!checked,
                          bound_exclusive_ids: checked ? [] : [],
                        }));
                      }}
                    />
                    <Label htmlFor="bind-all" className="cursor-pointer">全部包棟房型</Label>
                  </div>
                  
                  {/* 個別選擇 */}
                  {!formData.bind_all_exclusives && (
                    <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                      {exclusivePackages.map((pkg) => (
                        <div key={pkg.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`bind-${pkg.id}`}
                            checked={formData.bound_exclusive_ids.includes(pkg.id)}
                            onCheckedChange={(checked) => {
                              setFormData(prev => ({
                                ...prev,
                                bound_exclusive_ids: checked
                                  ? [...prev.bound_exclusive_ids, pkg.id]
                                  : prev.bound_exclusive_ids.filter(id => id !== pkg.id),
                              }));
                            }}
                          />
                          <Label htmlFor={`bind-${pkg.id}`} className="cursor-pointer">{pkg.name}</Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 沒有包棟房型時的提示 */}
              {formData.is_bound_to_exclusive && exclusivePackages.length === 0 && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>提示：</strong>目前沒有設定任何包棟房型。請先新增包棟房型後，再設定綁定關係。
                </div>
              )}
            </div>
          )}

          {/* 狀態提示 */}
          {formData.is_exclusive_package && formData.is_bound_to_exclusive && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>共用包棟：</strong>預訂後，其他「共用包棟」及「綁定包棟」的房型在同一天都會被鎖定。
            </div>
          )}

          {formData.is_exclusive_package && !formData.is_bound_to_exclusive && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              <strong>獨立包棟：</strong>此房型可獨立預訂，不會影響其他房型的可用狀態。
            </div>
          )}

          {!formData.is_exclusive_package && formData.is_bound_to_exclusive && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <strong>綁定包棟：</strong>此房型與共用包棟互相鎖定。當此房型被預訂時，共用包棟無法預訂；當共用包棟被預訂時，此房型也無法預訂。
            </div>
          )}

          {!formData.is_exclusive_package && !formData.is_bound_to_exclusive && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
              <strong>獨立房間：</strong>此房型可獨立預訂，不會影響其他房型的可用狀態。
            </div>
          )}
        </CardContent>
      </Card>

      {/* 房型照片 */}
      <Card>
        <CardHeader>
          <CardTitle>房型照片</CardTitle>
          <CardDescription>上傳房型照片並拖曳調整順序</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                type="button"
                onClick={() => document.getElementById('photo-upload')?.click()}
                disabled={uploading}
              >
                <Plus className="h-4 w-4 mr-2" />
                {uploading ? '上傳中...' : '上傳照片'}
              </Button>
            </div>

            {photoUrls.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={photoUrls} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-3 gap-4">
                    {photoUrls.map((url, index) => (
                      <SortablePhotoItem
                        key={url}
                        url={url}
                        index={index}
                        onRemove={() => setPhotoUrls(photoUrls.filter((_, i) => i !== index))}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </CardContent>
      </Card>

      <SaveButtonContainer onSave={handleSave} isSaving={isLoading}>
        <Button type="button" variant="outline" onClick={handleCancel}>
          取消
        </Button>
      </SaveButtonContainer>
    </div>
  );
}
