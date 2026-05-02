import { useState, useMemo, forwardRef, useImperativeHandle, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateAccommodationCache } from "@/hooks/use-accommodation-cache";
import { HQAccommodationSkeleton } from "@/components/skeletons/HQSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Plus, Pencil, Power, PowerOff, Loader2, ExternalLink, Copy, Search, X, Globe, Palette, GripVertical, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { AccommodationDialog } from "./AccommodationDialog";
import { DraggableAccommodationRow } from "./DraggableAccommodationRow";
import { GoogleReviewsSettings } from "@/components/website-content/GoogleReviewsSettings";
import { AccommodationHoverCard } from "./AccommodationHoverCard";
import { THEME_COLORS } from "@/constants/themes";
import { useAuditLog } from "@/hooks/use-audit-log";
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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";

interface Accommodation {
  id: string;
  name: string;
  type: string | null;
  registration_number: string | null;
  country: string | null;
  region_1: string | null;
  region_2: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  short_url_alias: string | null;
  theme_preset: string | null;
  header_logo_url: string | null;
  footer_logo_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface AccommodationManagementProps {
  accommodations: Accommodation[];
  onRefresh: () => void;
  loading: boolean;
}

export interface AccommodationManagementRef {
  openAddDialog: () => void;
}

export const AccommodationManagement = forwardRef<AccommodationManagementRef, AccommodationManagementProps>(({
  accommodations,
  onRefresh,
  loading,
}, ref) => {
  const { logAction } = useAuditLog();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccommodation, setEditingAccommodation] = useState<Accommodation | null>(null);
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [togglingAccommodation, setTogglingAccommodation] = useState<Accommodation | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  
  // Clone states
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloningAccommodation, setCloningAccommodation] = useState<Accommodation | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const [cloneProgress, setCloneProgress] = useState(0);
  const [cloneStep, setCloneStep] = useState("");

  // Delete states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccommodation, setDeletingAccommodation] = useState<Accommodation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // Expose openAddDialog to parent
  useImperativeHandle(ref, () => ({
    openAddDialog: () => {
      setEditingAccommodation(null);
      setDialogOpen(true);
    }
  }));

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Saving order state
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // Check if drag is disabled (when searching or filtering)
  const isDragDisabled = searchQuery.trim() !== "" || statusFilter !== "all";

  // Filtered accommodations (already sorted by display_order from database)
  const filteredAccommodations = useMemo(() => {
    return accommodations.filter((acc) => {
      // Status filter
      if (statusFilter === "active" && !acc.is_active) return false;
      if (statusFilter === "inactive" && acc.is_active) return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = acc.name.toLowerCase().includes(query);
        const matchesType = acc.type?.toLowerCase().includes(query);
        const matchesRegion = acc.region_1?.toLowerCase().includes(query) || acc.region_2?.toLowerCase().includes(query);
        const matchesPhone = acc.phone?.toLowerCase().includes(query);
        const matchesEmail = acc.email?.toLowerCase().includes(query);
        return matchesName || matchesType || matchesRegion || matchesPhone || matchesEmail;
      }

      return true;
    });
  }, [accommodations, searchQuery, statusFilter]);

  // Handle drag end
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const oldIndex = filteredAccommodations.findIndex(acc => acc.id === active.id);
    const newIndex = filteredAccommodations.findIndex(acc => acc.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;

    // Calculate new order for all items
    const reorderedItems = [...filteredAccommodations];
    const [movedItem] = reorderedItems.splice(oldIndex, 1);
    reorderedItems.splice(newIndex, 0, movedItem);

    // Update display_order in database
    setIsSavingOrder(true);
    try {
      const updates = reorderedItems.map((acc, index) => ({
        id: acc.id,
        display_order: index + 1,
      }));

      // Batch update using multiple calls
      for (const update of updates) {
        const { error } = await supabase
          .from("accommodation_info")
          .update({ display_order: update.display_order })
          .eq("id", update.id);
        
        if (error) throw error;
      }

      toast.success("排序已更新");
      onRefresh();
    } catch (error) {
      console.error("Failed to update order:", error);
      toast.error("更新排序失敗");
    } finally {
      setIsSavingOrder(false);
    }
  }, [filteredAccommodations, onRefresh]);

  const handleCreate = async (data: any) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("請先登入");
        return;
      }

      // Step 1: Create the accommodation and get the ID
      const { data: newAccommodation, error: createError } = await supabase
        .from("accommodation_info")
        .insert({
          name: data.name,
          type: data.type,
          registration_number: data.registration_number || null,
          country: data.country || "台灣",
          region_1: data.region_1 || null,
          region_2: data.region_2 || null,
          address: data.address || null,
          phone: data.phone || null,
          email: data.email || null,
          description: data.description || null,
          short_url_alias: data.short_url_alias || null,
          theme_preset: "default", // 一律使用人客多橘色
          is_active: true,
        })
        .select("id")
        .single();

      if (createError) throw createError;

      const accommodationId = newAccommodation.id;

      // Step 2: Create user role for current user (super_admin)
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: user.id,
          accommodation_id: accommodationId,
          role: "super_admin",
        });

      if (roleError) {
        console.warn("Failed to create user role:", roleError);
      }

      // Step 3: Create default settings in parallel
      const initPromises = [
        // Default booking settings
        supabase.from("booking_settings").insert({
          accommodation_id: accommodationId,
          check_in_time: "15:00",
          check_out_time: "11:00",
          use_deposit: true,
          deposit_percentage: 30,
          payment_methods: ["現金", "信用卡", "銀行轉帳"],
          cancellation_policy: "入住前7天可免費取消，入住前3天取消收取50%費用，入住前1天取消收取全額費用。",
          pet_policy: "本民宿不接受寵物入住。",
        }),

        // Default about section
        supabase.from("about_section").insert({
          accommodation_id: accommodationId,
          section_title: "關於我們",
          section_description: "歡迎來到我們的民宿，這裡提供舒適的住宿體驗。",
        }),

        // Default location info
        supabase.from("location_info").insert({
          accommodation_id: accommodationId,
          location_description: data.address || "",
          driving_info: "",
          public_transport_info: "",
        }),

      ];

      // Execute all init promises but don't fail if some fail
      const results = await Promise.allSettled(initPromises);
      
      // Log any failures but don't block the creation
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn(`Failed to create default setting ${index}:`, result.reason);
        }
      });

      // Log the action
      await logAction({
        actionType: "create",
        actionCategory: "accommodation",
        entityType: "accommodation",
        entityId: accommodationId,
        entityName: data.name,
        accommodationId: accommodationId,
        details: { type: data.type, region: `${data.region_1 || ''} ${data.region_2 || ''}`.trim() }
      });

      toast.success("民宿新增成功", {
        description: "已自動建立預訂設定等基礎資料",
      });
      onRefresh();
    } catch (error: any) {
      console.error("Error creating accommodation:", error);
      toast.error("新增民宿失敗", { description: error.message });
      throw error;
    }
  };

  const handleEdit = async (data: any) => {
    if (!editingAccommodation) return;

    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({
          name: data.name,
          type: data.type,
          registration_number: data.registration_number || null,
          country: data.country || "台灣",
          region_1: data.region_1 || null,
          region_2: data.region_2 || null,
          address: data.address || null,
          phone: data.phone || null,
          email: data.email || null,
          description: data.description || null,
          short_url_alias: data.short_url_alias || null,
          theme_preset: "default", // 一律使用人客多橘色
        })
        .eq("id", editingAccommodation.id);

      if (error) throw error;

      // Log the action
      await logAction({
        actionType: "update",
        actionCategory: "accommodation",
        entityType: "accommodation",
        entityId: editingAccommodation.id,
        entityName: data.name,
        accommodationId: editingAccommodation.id,
        details: { updated_fields: Object.keys(data) }
      });

      // 清除前台快取
      invalidateAccommodationCache(editingAccommodation.id);
      toast.success("民宿資訊已更新");
      setEditingAccommodation(null);
      onRefresh();
    } catch (error: any) {
      console.error("Error updating accommodation:", error);
      toast.error("更新民宿失敗", { description: error.message });
      throw error;
    }
  };

  const handleToggleActive = async () => {
    if (!togglingAccommodation) return;

    setIsToggling(true);
    try {
      const newStatus = !togglingAccommodation.is_active;
      const { error } = await supabase
        .from("accommodation_info")
        .update({ is_active: newStatus })
        .eq("id", togglingAccommodation.id);

      if (error) throw error;

      // Log the action
      await logAction({
        actionType: newStatus ? "enable" : "disable",
        actionCategory: "accommodation",
        entityType: "accommodation",
        entityId: togglingAccommodation.id,
        entityName: togglingAccommodation.name,
        accommodationId: togglingAccommodation.id,
        details: { new_status: newStatus }
      });

      // 清除前台快取
      invalidateAccommodationCache(togglingAccommodation.id);
      toast.success(newStatus ? "民宿已啟用" : "民宿已停用");
      setToggleDialogOpen(false);
      setTogglingAccommodation(null);
      onRefresh();
    } catch (error: any) {
      console.error("Error toggling accommodation:", error);
      toast.error("操作失敗", { description: error.message });
    } finally {
      setIsToggling(false);
    }
  };

  const openEditDialog = (accommodation: Accommodation) => {
    setEditingAccommodation(accommodation);
    setDialogOpen(true);
  };

  const openToggleDialog = (accommodation: Accommodation) => {
    setTogglingAccommodation(accommodation);
    setToggleDialogOpen(true);
  };

  const openCloneDialog = (accommodation: Accommodation) => {
    setCloningAccommodation(accommodation);
    setCloneName(`${accommodation.name} (複製)`);
    setCloneDialogOpen(true);
  };

  const openDeleteDialog = (accommodation: Accommodation) => {
    setDeletingAccommodation(accommodation);
    setDeleteConfirmName("");
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingAccommodation) return;
    if (deleteConfirmName !== deletingAccommodation.name) {
      toast.error("請輸入正確的民宿名稱以確認刪除");
      return;
    }

    setIsDeleting(true);
    try {
      // Delete the accommodation (cascade will handle related data)
      const { error } = await supabase
        .from("accommodation_info")
        .delete()
        .eq("id", deletingAccommodation.id);

      if (error) throw error;

      // Log the action
      await logAction({
        actionType: "delete",
        actionCategory: "accommodation",
        entityType: "accommodation",
        entityId: deletingAccommodation.id,
        entityName: deletingAccommodation.name,
        accommodationId: deletingAccommodation.id,
        details: { name: deletingAccommodation.name }
      });

      // Clear cache
      invalidateAccommodationCache(deletingAccommodation.id);
      toast.success("民宿已刪除");
      setDeleteDialogOpen(false);
      setDeletingAccommodation(null);
      setDeleteConfirmName("");
      onRefresh();
    } catch (error: any) {
      console.error("Error deleting accommodation:", error);
      toast.error("刪除失敗", { description: error.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClone = async () => {
    if (!cloningAccommodation || !cloneName.trim()) return;

    setIsCloning(true);
    setCloneProgress(0);
    setCloneStep("建立新民宿...");
    
    const steps = [
      { name: "預訂設定", weight: 10 },
      { name: "關於我們", weight: 10 },
      { name: "特色說明", weight: 10 },
      { name: "位置資訊", weight: 10 },
      { name: "價格模板", weight: 10 },
      { name: "常見問題", weight: 10 },
      { name: "民宿設施", weight: 10 },
      { name: "房型設定", weight: 20 },
      { name: "附加服務", weight: 10 },
    ];
    
    let completedWeight = 0;
    const totalWeight = steps.reduce((sum, s) => sum + s.weight, 0);
    
    try {
      const sourceId = cloningAccommodation.id;

      // Step 1: Create new accommodation (5%)
      const { data: newAccommodation, error: createError } = await supabase
        .from("accommodation_info")
        .insert({
          name: cloneName.trim(),
          type: cloningAccommodation.type,
          registration_number: null,
          country: cloningAccommodation.country,
          region_1: cloningAccommodation.region_1,
          region_2: cloningAccommodation.region_2,
          address: cloningAccommodation.address,
          phone: cloningAccommodation.phone,
          email: cloningAccommodation.email,
          description: cloningAccommodation.description,
          theme_preset: "default", // 一律使用人客多橘色
          is_active: true,
        })
        .select("id")
        .single();

      if (createError) throw createError;
      const newId = newAccommodation.id;
      setCloneProgress(5);

      // Helper to update progress
      const updateProgress = (stepIndex: number) => {
        completedWeight = steps.slice(0, stepIndex + 1).reduce((sum, s) => sum + s.weight, 0);
        setCloneProgress(5 + Math.round((completedWeight / totalWeight) * 95));
      };

      // Step 2: Copy booking settings
      setCloneStep(steps[0].name);
      try {
        const { data } = await supabase
          .from("booking_settings")
          .select("*")
          .eq("accommodation_id", sourceId)
          .single();
        if (data) {
          const { id, accommodation_id, created_at, updated_at, ...rest } = data;
          await supabase.from("booking_settings").insert({ ...rest, accommodation_id: newId });
        }
      } catch (e) { console.warn("Failed to copy booking settings:", e); }
      updateProgress(0);

      // Step 3: Copy about section
      setCloneStep(steps[1].name);
      try {
        const { data } = await supabase
          .from("about_section")
          .select("*")
          .eq("accommodation_id", sourceId)
          .single();
        if (data) {
          const { id, accommodation_id, created_at, updated_at, ...rest } = data;
          await supabase.from("about_section").insert({ ...rest, accommodation_id: newId });
        }
      } catch (e) { console.warn("Failed to copy about section:", e); }
      updateProgress(1);

      // Step 4: Copy about features
      setCloneStep(steps[2].name);
      try {
        const { data } = await supabase
          .from("about_features")
          .select("*")
          .eq("accommodation_id", sourceId);
        if (data && data.length > 0) {
          const newFeatures = data.map(({ id, accommodation_id, created_at, updated_at, ...rest }) => ({
            ...rest,
            accommodation_id: newId,
          }));
          await supabase.from("about_features").insert(newFeatures);
        }
      } catch (e) { console.warn("Failed to copy about features:", e); }
      updateProgress(2);

      // Step 5: Copy location info
      setCloneStep(steps[3].name);
      try {
        const { data } = await supabase
          .from("location_info")
          .select("*")
          .eq("accommodation_id", sourceId)
          .single();
        if (data) {
          const { id, accommodation_id, created_at, updated_at, ...rest } = data;
          await supabase.from("location_info").insert({ ...rest, accommodation_id: newId });
        }
      } catch (e) { console.warn("Failed to copy location info:", e); }
      updateProgress(3);

      // Step 6: Copy pricing templates
      setCloneStep(steps[4].name);
      try {
        const { data } = await supabase
          .from("pricing_templates")
          .select("*")
          .eq("accommodation_id", sourceId);
        if (data && data.length > 0) {
          const newTemplates = data.map(({ id, accommodation_id, created_at, updated_at, ...rest }) => ({
            ...rest,
            accommodation_id: newId,
          }));
          await supabase.from("pricing_templates").insert(newTemplates);
        }
      } catch (e) { console.warn("Failed to copy pricing templates:", e); }
      updateProgress(4);

      // Step 7: Copy FAQs
      setCloneStep(steps[5].name);
      try {
        const { data } = await supabase
          .from("faqs")
          .select("*")
          .eq("accommodation_id", sourceId);
        if (data && data.length > 0) {
          const newFaqs = data.map(({ id, accommodation_id, created_at, updated_at, ...rest }) => ({
            ...rest,
            accommodation_id: newId,
          }));
          await supabase.from("faqs").insert(newFaqs);
        }
      } catch (e) { console.warn("Failed to copy FAQs:", e); }
      updateProgress(5);

      // Step 8: Copy facilities
      setCloneStep(steps[6].name);
      try {
        const { data } = await supabase
          .from("accommodation_facilities")
          .select("*")
          .eq("accommodation_id", sourceId);
        if (data && data.length > 0) {
          const newFacilities = data.map(({ id, accommodation_id, created_at, ...rest }) => ({
            ...rest,
            accommodation_id: newId,
          }));
          await supabase.from("accommodation_facilities").insert(newFacilities);
        }
      } catch (e) { console.warn("Failed to copy facilities:", e); }
      updateProgress(6);

      // Step 9: Copy room types with amenities
      setCloneStep(steps[7].name);
      try {
        const { data: roomTypes } = await supabase
          .from("room_types")
          .select("*")
          .eq("accommodation_id", sourceId);
        
        if (roomTypes && roomTypes.length > 0) {
          for (const roomType of roomTypes) {
            const { id: oldRoomId, accommodation_id, created_at, updated_at, ...rest } = roomType;
            
            const { data: newRoomType } = await supabase
              .from("room_types")
              .insert({ ...rest, accommodation_id: newId })
              .select("id")
              .single();
            
            if (newRoomType) {
              const { data: amenities } = await supabase
                .from("room_amenities")
                .select("*")
                .eq("room_type_id", oldRoomId);
              
              if (amenities && amenities.length > 0) {
                const newAmenities = amenities.map(({ id, room_type_id, created_at, ...rest }) => ({
                  ...rest,
                  room_type_id: newRoomType.id,
                }));
                await supabase.from("room_amenities").insert(newAmenities);
              }
            }
          }
        }
      } catch (e) { console.warn("Failed to copy room types:", e); }
      updateProgress(7);

      // Step 10: Copy addon settings
      setCloneStep(steps[8].name);
      try {
        const { data } = await supabase
          .from("addon_settings")
          .select("*")
          .eq("accommodation_id", sourceId);
        if (data && data.length > 0) {
          const newAddons = data.map(({ id, accommodation_id, created_at, updated_at, ...rest }) => ({
            ...rest,
            accommodation_id: newId,
          }));
          await supabase.from("addon_settings").insert(newAddons);
        }
      } catch (e) { console.warn("Failed to copy addon settings:", e); }
      updateProgress(8);

      setCloneStep("完成！");
      setCloneProgress(100);

      // Small delay to show 100%
      await new Promise(resolve => setTimeout(resolve, 500));

      toast.success("民宿複製成功", {
        description: `已建立「${cloneName.trim()}」並複製所有設定`,
      });

      setCloneDialogOpen(false);
      setCloningAccommodation(null);
      setCloneName("");
      setCloneProgress(0);
      setCloneStep("");
      onRefresh();
    } catch (error: any) {
      console.error("Error cloning accommodation:", error);
      toast.error("複製民宿失敗", { description: error.message });
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="space-y-4 pt-6">
          {/* Search and Filter */}
          {!loading && accommodations.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="搜尋民宿名稱"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="!pl-10 pr-9"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部狀態</SelectItem>
                  <SelectItem value="active">營運中</SelectItem>
                  <SelectItem value="inactive">已停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {loading ? (
            <HQAccommodationSkeleton />
          ) : accommodations.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="尚無民宿資料"
              description="點擊「新增民宿」開始建立第一個民宿"
            />
          ) : filteredAccommodations.length === 0 ? (
            <EmptyState
              icon={Search}
              title="找不到符合的民宿"
              description="嘗試調整搜尋條件或篩選狀態"
            />
          ) : (
            <div className="overflow-x-auto rounded-md border relative">
              {isSavingOrder && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    儲存排序中...
                  </div>
                </div>
              )}
              {isDragDisabled && (
                <div className="bg-muted/50 px-4 py-2 text-xs text-muted-foreground border-b flex items-center gap-2">
                  <GripVertical className="h-3 w-3" />
                  搜尋或篩選時無法拖曳排序，請清除條件後再進行排序
                </div>
              )}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10 px-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
                      </TableHead>
                      <TableHead>民宿名稱</TableHead>
                      
                      <TableHead>訂房連結</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead>建立時間</TableHead>
                      <TableHead className="text-center">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <SortableContext
                      items={filteredAccommodations.map(acc => acc.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {filteredAccommodations.map((acc) => (
                        <DraggableAccommodationRow
                          key={acc.id}
                          accommodation={acc}
                          onEdit={openEditDialog}
                          onClone={openCloneDialog}
                          onToggle={openToggleDialog}
                          onDelete={openDeleteDialog}
                          isDragDisabled={isDragDisabled}
                        />
                      ))}
                    </SortableContext>
                  </TableBody>
                </Table>
              </DndContext>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <AccommodationDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingAccommodation(null);
        }}
        onSubmit={editingAccommodation ? handleEdit : handleCreate}
        initialData={editingAccommodation || undefined}
        isEditing={!!editingAccommodation}
      />

      {/* Toggle Active Dialog */}
      <AlertDialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {togglingAccommodation?.is_active ? "停用民宿" : "啟用民宿"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {togglingAccommodation?.is_active
                ? `確定要停用「${togglingAccommodation?.name}」嗎？停用後該民宿將無法接受新訂單。`
                : `確定要啟用「${togglingAccommodation?.name}」嗎？啟用後該民宿可以正常接受訂單。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isToggling}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleActive}
              disabled={isToggling}
              className={togglingAccommodation?.is_active ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {isToggling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {togglingAccommodation?.is_active ? "停用" : "啟用"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clone Dialog */}
      <Dialog open={cloneDialogOpen} onOpenChange={(open) => {
        setCloneDialogOpen(open);
        if (!open) {
          setCloningAccommodation(null);
          setCloneName("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              複製民宿
            </DialogTitle>
            <DialogDescription>
              將「{cloningAccommodation?.name}」的所有設定複製到新民宿
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cloneName">新民宿名稱</Label>
              <Input
                id="cloneName"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="請輸入新民宿名稱"
                disabled={isCloning}
              />
            </div>
            
            {isCloning ? (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">正在複製：{cloneStep}</span>
                  <span className="font-medium">{cloneProgress}%</span>
                </div>
                <Progress value={cloneProgress} className="h-2" />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium">將複製以下設定：</p>
                <ul className="list-disc list-inside space-y-0.5 ml-2">
                  <li>預訂設定（入住時間、付款方式等）</li>
                  <li>房型設定與設施</li>
                  <li>價格模板</li>
                  <li>關於我們內容</li>
                  <li>常見問題 FAQ</li>
                  <li>民宿設施</li>
                  <li>附加服務設定</li>
                </ul>
                <p className="text-xs mt-2 text-muted-foreground/80">
                  註：圖片、訂單、客戶資料不會被複製
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCloneDialogOpen(false)}
              disabled={isCloning}
            >
              取消
            </Button>
            <Button
              onClick={handleClone}
              disabled={isCloning || !cloneName.trim()}
            >
              {isCloning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isCloning ? "複製中..." : "確認複製"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setDeletingAccommodation(null);
          setDeleteConfirmName("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              刪除民宿
            </DialogTitle>
            <DialogDescription>
              此操作將永久刪除「{deletingAccommodation?.name}」及其所有相關資料，包括訂單、客戶、房型、價格設定等。此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm space-y-2">
              <p className="font-medium text-destructive">⚠️ 警告：以下資料將被永久刪除</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2 text-muted-foreground">
                <li>所有訂單紀錄</li>
                <li>客戶資料</li>
                <li>房型與價格設定</li>
                <li>照片與內容設定</li>
                <li>使用者權限設定</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deleteConfirm">
                請輸入民宿名稱「<span className="font-semibold">{deletingAccommodation?.name}</span>」以確認刪除
              </Label>
              <Input
                id="deleteConfirm"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder="請輸入民宿名稱"
                disabled={isDeleting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || deleteConfirmName !== deletingAccommodation?.name}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeleting ? "刪除中..." : "確認刪除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
