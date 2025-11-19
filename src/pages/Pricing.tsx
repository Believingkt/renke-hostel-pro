import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, GripVertical, Hotel, DollarSign, Wrench, Package, Calendar } from "lucide-react";
import { ResponsiveTabs, TabItem } from "@/components/ResponsiveTabs";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RoomTypeForm } from "@/components/RoomTypeForm";
import { RoomFacilitiesForm } from "@/components/RoomFacilitiesForm";
import { TabsSkeleton } from "@/components/skeletons/TabsSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import PublicHolidays from "@/pages/PublicHolidays";
import { InventoryCalendar } from "@/components/InventoryCalendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableRoomCardProps {
  roomType: any;
  onEdit: (roomType: any) => void;
  onDelete: (roomType: any) => void;
}

const SortableRoomCard = ({ roomType, onEdit, onDelete }: SortableRoomCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: roomType.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <button
            className="mt-1 cursor-grab active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </button>
          
          <div className="flex-1">
            <div className="mb-3">
              <h3 className="text-xl font-bold">{roomType.name}</h3>
            </div>
            
            {roomType.description && (
              <p className="text-sm text-muted-foreground mb-4">
                {roomType.description}
              </p>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">坪數：</span>
                <span className="font-medium">
                  {roomType.size_sqm ? `${roomType.size_sqm} m²` : '未設定'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">容納人數：</span>
                <span className="font-medium">{roomType.capacity} 人</span>
              </div>
              <div>
                <span className="text-muted-foreground">房間數量：</span>
                <span className="font-medium">{roomType.room_count || 1} 間</span>
              </div>
              <div>
                <span className="text-muted-foreground">顯示順序：</span>
                <span className="font-medium">{roomType.display_order}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div>
                <span className="text-muted-foreground">平日價格：</span>
                <span className="font-bold text-primary">
                  {roomType.weekday_price ? `NT$ ${roomType.weekday_price.toLocaleString()}` : '未設定'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">假日價格：</span>
                <span className="font-bold text-primary">
                  {roomType.weekend_price ? `NT$ ${roomType.weekend_price.toLocaleString()}` : '未設定'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onEdit(roomType)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onDelete(roomType)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const Pricing = () => {
  const { currentAccommodationId } = useAccommodation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "rooms");
  
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRoomType, setEditingRoomType] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRoomType, setDeletingRoomType] = useState<any>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && (tab === "rooms" || tab === "basic" || tab === "inventory" || tab === "facilities")) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (currentAccommodationId && activeTab === "rooms") {
      loadRoomTypes();
    }
  }, [currentAccommodationId, activeTab]);

  const loadRoomTypes = async () => {
    if (!currentAccommodationId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('room_types')
        .select('*')
        .eq('accommodation_id', currentAccommodationId)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setRoomTypes(data || []);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading room types:', error);
      }
      toast.error("無法載入房型資料");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingRoomType(null);
    setShowForm(true);
  };

  const handleEdit = (roomType: any) => {
    setEditingRoomType(roomType);
    setShowForm(true);
  };

  const handleDelete = (roomType: any) => {
    setDeletingRoomType(roomType);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingRoomType) return;

    try {
      // Delete photos first
      await supabase
        .from("room_photos")
        .delete()
        .eq("room_type_id", deletingRoomType.id);

      // Delete room
      const { error } = await supabase
        .from('room_types')
        .delete()
        .eq('id', deletingRoomType.id);

      if (error) throw error;

      toast.success("房型已成功刪除");
      loadRoomTypes();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting room type:', error);
      }
      toast.error("無法刪除房型，請重試");
    } finally {
      setDeleteDialogOpen(false);
      setDeletingRoomType(null);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingRoomType(null);
    loadRoomTypes();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingRoomType(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = roomTypes.findIndex((item) => item.id === active.id);
      const newIndex = roomTypes.findIndex((item) => item.id === over.id);

      const newRoomTypes = arrayMove(roomTypes, oldIndex, newIndex);
      setRoomTypes(newRoomTypes);

      // Update display_order in database
      try {
        const updates = newRoomTypes.map((roomType, index) => 
          supabase
            .from('room_types')
            .update({ display_order: index })
            .eq('id', roomType.id)
        );

        await Promise.all(updates);
        toast.success("房型順序已更新");
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error updating room order:', error);
        }
        toast.error("無法更新房型順序");
        loadRoomTypes(); // Reload to reset order
      }
    }
  };

  const pricingTabs: TabItem[] = [
    { value: "rooms", label: "房型管理", icon: Hotel },
    { value: "basic", label: "價格管理", icon: DollarSign },
    { value: "facilities", label: "客房設施", icon: Wrench },
    { value: "inventory", label: "庫存管理", icon: Package },
    { value: "holidays", label: "國定假日", icon: Calendar },
  ];

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsContent value="rooms" className="space-y-4">
          <div className="pb-4 border-b border-primary/20 mb-6">
            <h2 className="text-3xl font-bold flex items-center gap-2.5">
              <Hotel className="h-8 w-8 text-primary" />
              房型管理
            </h2>
          </div>
          {showForm ? (
            <RoomTypeForm
              accommodationId={currentAccommodationId || ""}
              roomType={editingRoomType}
              onSuccess={handleFormSuccess}
              onCancel={handleFormCancel}
            />
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>房型管理</CardTitle>
                  <CardDescription className="mt-2">
                    管理住宿的各種房型資訊
                  </CardDescription>
                </div>
                <Button onClick={handleAddNew} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  新增房型
                </Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <TabsSkeleton />
                ) : error ? (
                  <ErrorState
                    title="無法載入房型資料"
                    message={error}
                    onRetry={loadRoomTypes}
                  />
                ) : roomTypes.length === 0 ? (
                  <EmptyState
                    icon={Hotel}
                    title="尚無房型資料"
                    description="開始新增您的第一個房型，建立完整的住宿資訊"
                    action={{
                      label: "新增房型",
                      onClick: handleAddNew
                    }}
                  />
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={roomTypes.map(rt => rt.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4">
                        {roomTypes.map((roomType) => (
                          <SortableRoomCard
                            key={roomType.id}
                            roomType={roomType}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="facilities" className="space-y-4">
          <div className="pb-4 border-b border-primary/20 mb-6">
            <h2 className="text-3xl font-bold flex items-center gap-2.5">
              <Wrench className="h-8 w-8 text-primary" />
              房間設施
            </h2>
          </div>
          <RoomFacilitiesForm accommodationId={currentAccommodationId || ""} />
        </TabsContent>

        <TabsContent value="basic" className="space-y-4">
          <div className="pb-4 border-b border-primary/20 mb-6">
            <h2 className="text-3xl font-bold flex items-center gap-2.5">
              <DollarSign className="h-8 w-8 text-primary" />
              價格設定
            </h2>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>基本價格</CardTitle>
              <CardDescription>
                設定各房型的基本房價
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">基本價格設定內容</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>專案價格</CardTitle>
              <CardDescription>
                設定特殊專案的優惠價格
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">專案價格設定內容</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <div className="pb-4 border-b border-primary/20 mb-6">
            <h2 className="text-3xl font-bold flex items-center gap-2.5">
              <Package className="h-8 w-8 text-primary" />
              房量管理
            </h2>
          </div>
          <InventoryCalendar accommodationId={currentAccommodationId || ""} />
        </TabsContent>

        <TabsContent value="holidays" className="space-y-4">
          <div className="pb-4 border-b border-primary/20 mb-6">
            <h2 className="text-3xl font-bold flex items-center gap-2.5">
              <Calendar className="h-8 w-8 text-primary" />
              公休設定
            </h2>
          </div>
          <PublicHolidays />
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除房型「{deletingRoomType?.name}」嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Pricing;
