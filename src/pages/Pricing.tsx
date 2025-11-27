import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, GripVertical, Hotel, DollarSign, Wrench, Package, Calendar, Bed } from "lucide-react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RoomTypeForm } from "@/components/RoomTypeForm";
import { RoomFacilitiesForm } from "@/components/RoomFacilitiesForm";
import { PricingTemplateManager } from "@/components/PricingTemplateManager";
import { TabsSkeleton } from "@/components/skeletons/TabsSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import PublicHolidays, { PublicHolidaysButtons } from "@/pages/PublicHolidays";
import { InventoryManagement } from "@/components/InventoryManagement";
import { PageHeader } from "@/components/PageHeader";
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
      <CardContent className="pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row items-start gap-3">
          <button
            className="mt-1 cursor-grab active:cursor-grabbing touch-none self-start"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </button>
          
          <div className="flex-1 min-w-0 w-full">
            <div className="mb-3">
              <h3 className="text-lg sm:text-xl font-bold break-words">{roomType.name}</h3>
            </div>
            
            {roomType.description && (
              <p className="text-sm text-muted-foreground mb-4 break-words">
                {roomType.description}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-sm">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-4 text-sm">
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

          <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onEdit(roomType)}
              className="flex-1 sm:flex-initial"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost-destructive"
              size="icon"
              onClick={() => onDelete(roomType)}
              className="flex-1 sm:flex-initial"
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
  const publicHolidaysRef = useRef<{
    openAddDialog: () => void;
    openBatchDialog: () => void;
  }>(null);
  
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRoomType, setEditingRoomType] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRoomType, setDeletingRoomType] = useState<any>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && (tab === "rooms" || tab === "basic" || tab === "inventory" || tab === "facilities" || tab === "holidays")) {
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

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-0">
      <Tabs value={activeTab} onValueChange={(value) => {
        setActiveTab(value);
        setSearchParams({ tab: value });
      }} className="w-full">
        <TabsContent value="rooms" className="space-y-4">
          <PageHeader
            title="房型管理"
            icon={Bed}
            action={
              !showForm && (
                <Button onClick={handleAddNew} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  新增房型
                </Button>
              )
            }
          />
          {showForm ? (
            <RoomTypeForm
              accommodationId={currentAccommodationId || ""}
              roomType={editingRoomType}
              onSuccess={handleFormSuccess}
              onCancel={handleFormCancel}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardDescription>
                  管理住宿的各種房型資訊
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3 sm:space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Card key={i} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                        <CardContent className="pt-4 sm:pt-6">
                          <div className="flex flex-col sm:flex-row items-start gap-3">
                            <Skeleton className="h-5 w-5 shrink-0 mt-1" />
                            <div className="flex-1 min-w-0 w-full space-y-3">
                              <Skeleton className="h-5 sm:h-6 w-3/4" />
                              <Skeleton className="h-3 sm:h-4 w-full" />
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-full" />
                              </div>
                            </div>
                            <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                              <Skeleton className="h-9 w-9 flex-1 sm:flex-initial" />
                              <Skeleton className="h-9 w-9 flex-1 sm:flex-initial" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
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
          <PageHeader
            title="房間設施"
            icon={Wrench}
          />
          <RoomFacilitiesForm accommodationId={currentAccommodationId || ""} />
        </TabsContent>

        <TabsContent value="basic" className="space-y-4">
          <PageHeader
            title="批次設定"
            icon={DollarSign}
          />
          <PricingTemplateManager accommodationId={currentAccommodationId || ""} />
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <PageHeader
            title="庫存設定"
            icon={Package}
          />
          <InventoryManagement accommodationId={currentAccommodationId || ""} />
        </TabsContent>

        <TabsContent value="holidays" className="space-y-4">
          <PageHeader
            title="國定假日"
            icon={Calendar}
            action={
              <PublicHolidaysButtons 
                onAddClick={() => publicHolidaysRef.current?.openAddDialog()}
                onBatchClick={() => publicHolidaysRef.current?.openBatchDialog()}
              />
            }
          />
          <PublicHolidays ref={publicHolidaysRef} showInPricingPage={true} />
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
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Pricing;
