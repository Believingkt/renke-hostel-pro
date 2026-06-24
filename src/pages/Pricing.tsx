import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, GripVertical, Hotel, DollarSign, Wrench, Package, Calendar, Bed, Home } from "lucide-react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RoomTypeForm } from "@/components/RoomTypeForm";
import { RoomFacilitiesForm } from "@/components/RoomFacilitiesForm";
import { ExclusivePackageSettings } from "@/components/website-content/ExclusivePackageSettings";
import { VillaPageContentSettings } from "@/components/website-content/VillaPageContentSettings";
import { PricingTemplateManager, PricingTemplateManagerRef } from "@/components/PricingTemplateManager";
import { TabsSkeleton } from "@/components/skeletons/TabsSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import PublicHolidays, { PublicHolidaysButtons } from "@/pages/PublicHolidays";
import { PageHeader } from "@/components/PageHeader";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">坪數：</span>
                <span className="font-medium">
                  {roomType.size_sqm ? `${roomType.size_sqm} 坪` : '未設定'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">容納人數：</span>
                <span className="font-medium">{roomType.capacity} 人</span>
              </div>
              <div>
                <span className="text-muted-foreground">顯示順序：</span>
                <span className="font-medium">{(roomType.display_order || 0) < 1 ? 1 : roomType.display_order}</span>
              </div>
            </div>
          </div>

          <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onEdit(roomType)}
              className="flex-1 sm:flex-initial h-10 sm:h-9 touch-manipulation"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost-destructive"
              size="icon"
              onClick={() => onDelete(roomType)}
              className="flex-1 sm:flex-initial h-10 sm:h-9 touch-manipulation"
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
  const pricingTemplateRef = useRef<PricingTemplateManagerRef>(null);
  
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRoomType, setEditingRoomType] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRoomType, setDeletingRoomType] = useState<any>(null);

  useEffect(() => {
    // 路徑強制決定 tab：/admin/projects → basic, /admin/holidays → holidays
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path.endsWith("/admin/projects")) {
        setActiveTab("basic");
        return;
      }
      if (path.endsWith("/admin/holidays")) {
        setActiveTab("holidays");
        return;
      }
    }
    const tab = searchParams.get("tab");
    if (tab && (tab === "rooms" || tab === "basic" || tab === "facilities" || tab === "holidays")) {
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
      
      // 依目前排序自動重新編號為 1..N，確保顯示順序連續
      const sourceRooms = data || [];
      const roomTypesWithOrder = sourceRooms.map((room, index) => ({
        ...room,
        display_order: index + 1,
      }));

      setRoomTypes(roomTypesWithOrder);

      // 任何原始 display_order 與重編號後不一致時，寫回資料庫
      const needsUpdate = roomTypesWithOrder.some(
        (room, index) => sourceRooms[index].display_order !== room.display_order
      );

      if (needsUpdate) {
        const updates = roomTypesWithOrder
          .filter((room, index) => sourceRooms[index].display_order !== room.display_order)
          .map((room) =>
            supabase
              .from('room_types')
              .update({ display_order: room.display_order })
              .eq('id', room.id)
          );

        await Promise.all(updates);
      }
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
      
      // 立即更新本地狀態的 display_order
      const updatedRoomTypes = newRoomTypes.map((roomType, index) => ({
        ...roomType,
        display_order: index + 1
      }));
      
      setRoomTypes(updatedRoomTypes);

      // Update display_order in database
      try {
        const updates = updatedRoomTypes.map((roomType) => 
          supabase
            .from('room_types')
            .update({ display_order: roomType.display_order })
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

  const getTabName = (tab: string) => {
    switch (tab) {
      case "rooms":
        return "房型管理";
      case "facilities":
        return "客房設施";
      case "basic":
        return "房價價格設定";
      case "holidays":
        return "國定假日";
      default:
        return "房型管理";
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-0">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin/pricing">物件管理</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {showForm && activeTab === "rooms" ? (
              <BreadcrumbLink asChild>
                <button 
                  onClick={() => {
                    setShowForm(false);
                    setEditingRoomType(null);
                  }}
                  className="hover:underline cursor-pointer"
                >
                  房型管理
                </button>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>{getTabName(activeTab)}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {showForm && activeTab === "rooms" && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {editingRoomType ? "編輯房型" : "新增房型"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

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
          {!showForm && currentAccommodationId && (
            <>
              <ExclusivePackageSettings accommodationId={currentAccommodationId} />
              <VillaPageContentSettings accommodationId={currentAccommodationId} />
            </>
          )}
        </TabsContent>


        <TabsContent value="facilities" className="space-y-4">
          <PageHeader
            title="客房設施"
            icon={Wrench}
          />
          <RoomFacilitiesForm accommodationId={currentAccommodationId || ""} />
        </TabsContent>

        <TabsContent value="basic" className="space-y-4">
          <PageHeader
            title="房價價格設定"
            icon={DollarSign}
            action={
              <Button onClick={() => pricingTemplateRef.current?.openAddDialog()} className="flex items-center gap-2 h-11 sm:h-10 touch-manipulation">
                <Plus className="h-4 w-4" />
                新增專案
              </Button>
            }
          />
          <PricingTemplateManager ref={pricingTemplateRef} accommodationId={currentAccommodationId || ""} />
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
