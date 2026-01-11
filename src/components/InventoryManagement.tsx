import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, ChevronLeft, ChevronRight, Check, Edit, X, Calendar, CalendarDays, CalendarRange, Briefcase, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, isWeekend as isWeekendDate, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

interface RoomType {
  id: string;
  name: string;
  room_count: number;
}

interface InventoryData {
  [date: string]: {
    availableRooms: number;
    id?: string;
  };
}

interface InventoryManagementProps {
  accommodationId: string;
}

export function InventoryManagement({ accommodationId }: InventoryManagementProps) {
  const isMobile = useIsMobile();
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [selectedRoomType, setSelectedRoomType] = useState<string>("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [inventory, setInventory] = useState<InventoryData>({});
  const [loading, setLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false);
  const [batchInventory, setBatchInventory] = useState("");
  const [saving, setSaving] = useState(false);
  const [isCopyMode, setIsCopyMode] = useState(false);
  const [copiedData, setCopiedData] = useState<{ availableRooms: number } | null>(null);
  const [singleEditDialogOpen, setSingleEditDialogOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [singleEditInventory, setSingleEditInventory] = useState("");

  useEffect(() => {
    if (accommodationId) {
      loadRoomTypes();
    }
  }, [accommodationId]);

  useEffect(() => {
    if (selectedRoomType) {
      loadInventoryData();
    }
  }, [selectedRoomType, currentMonth]);

  // 批量編輯對話框鍵盤快捷鍵
  useEffect(() => {
    if (!batchEditDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBatchEditDialogOpen(false);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (batchInventory && !saving) {
          confirmBatchEdit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [batchEditDialogOpen, batchInventory, saving]);

  // 單日期編輯對話框鍵盤快捷鍵
  useEffect(() => {
    if (!singleEditDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSingleEditDialogOpen(false);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (singleEditInventory && !saving) {
          handleSingleDateUpdate();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [singleEditDialogOpen, singleEditInventory, saving]);

  const loadRoomTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('room_types')
        .select('id, name, room_count')
        .eq('accommodation_id', accommodationId)
        .order('display_order', { ascending: true });

      if (error) throw error;

      setRoomTypes(data || []);
      if (data && data.length > 0) {
        setSelectedRoomType(data[0].id);
      }
    } catch (error) {
      console.error('載入房型失敗:', error);
      toast.error('載入房型資料失敗');
    } finally {
      setLoading(false);
    }
  };

  const loadInventoryData = async () => {
    if (!selectedRoomType) return;

    try {
      setLoading(true);
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);

      const { data, error } = await supabase
        .from('room_inventory_pricing')
        .select('*')
        .eq('room_type_id', selectedRoomType)
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'));

      if (error) throw error;

      const inventoryMap: InventoryData = {};
      data?.forEach((item) => {
        inventoryMap[item.date] = {
          availableRooms: item.available_rooms,
          id: item.id,
        };
      });

      setInventory(inventoryMap);
    } catch (error) {
      console.error('載入庫存資料失敗:', error);
      toast.error('載入庫存資料失敗');
    } finally {
      setLoading(false);
    }
  };

  const toggleDateSelection = (dateStr: string) => {
    if (!isSelectionMode) return;
    
    // 如果在複製模式下，點擊有資料的日期會複製它
    if (isCopyMode && inventory[dateStr]) {
      const dayData = inventory[dateStr];
      setCopiedData({ availableRooms: dayData.availableRooms });
      setIsCopyMode(false);
      setSelectedDates(new Set());
      toast.success(`已複製 ${format(parseISO(dateStr), 'M月d日', { locale: zhTW })} 的庫存設定`);
      return;
    }
    
    const newSelected = new Set(selectedDates);
    if (newSelected.has(dateStr)) {
      newSelected.delete(dateStr);
    } else {
      newSelected.add(dateStr);
    }
    setSelectedDates(newSelected);
  };

  const handleDoubleClick = (dateStr: string) => {
    if (isSelectionMode) return;
    
    const dayData = inventory[dateStr];
    setEditingDate(dateStr);
    setSingleEditInventory(dayData?.availableRooms?.toString() || "");
    setSingleEditDialogOpen(true);
  };

  const handleOpenBatchEdit = () => {
    if (selectedDates.size === 0) {
      toast.error('請至少選擇一個日期');
      return;
    }
    setBatchInventory("");
    setBatchEditDialogOpen(true);
  };

  const handleCancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedDates(new Set());
    setIsCopyMode(false);
    setCopiedData(null);
  };

  const handleStartCopyMode = () => {
    setIsCopyMode(true);
    setSelectedDates(new Set());
    setCopiedData(null);
    toast.info('請點擊要複製的日期');
  };

  const selectWeekends = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const weekendDates = days
      .filter(day => isWeekendDate(day))
      .map(day => format(day, 'yyyy-MM-dd'));
    
    setSelectedDates(new Set(weekendDates));
    toast.success(`已選擇 ${weekendDates.length} 個週末日期`);
  };

  const selectWeekdays = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const weekdayDates = days
      .filter(day => !isWeekendDate(day))
      .map(day => format(day, 'yyyy-MM-dd'));
    
    setSelectedDates(new Set(weekdayDates));
    toast.success(`已選擇 ${weekdayDates.length} 個工作日日期`);
  };

  const selectCurrentWeek = () => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    
    const weekDates = days.map(day => format(day, 'yyyy-MM-dd'));
    
    setSelectedDates(new Set(weekDates));
    toast.success(`已選擇本週 ${weekDates.length} 個日期`);
  };

  const selectWholeMonth = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const monthDates = days.map(day => format(day, 'yyyy-MM-dd'));
    
    setSelectedDates(new Set(monthDates));
    toast.success(`已選擇整月 ${monthDates.length} 個日期`);
  };

  const clearSelection = () => {
    setSelectedDates(new Set());
    toast.success('已清除選擇');
  };

  const applyRoomCountAsInventory = async () => {
    if (!selectedRoomTypeData?.room_count) {
      toast.error('無法取得房型的總房間數');
      return;
    }

    if (selectedDates.size === 0) {
      toast.error('請至少選擇一個日期');
      return;
    }

    try {
      setSaving(true);
      const updates = Array.from(selectedDates).map(async (dateStr) => {
        const existing = inventory[dateStr];
        
        if (existing?.id) {
          return supabase
            .from('room_inventory_pricing')
            .update({ 
              available_rooms: selectedRoomTypeData.room_count,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          return supabase
            .from('room_inventory_pricing')
            .insert({
              room_type_id: selectedRoomType,
              date: dateStr,
              available_rooms: selectedRoomTypeData.room_count,
              price: 0,
            });
        }
      });

      await Promise.all(updates);

      toast.success(`已將 ${selectedRoomTypeData.room_count} 間房套用到 ${selectedDates.size} 個日期`);
      setIsSelectionMode(false);
      setSelectedDates(new Set());
      loadInventoryData();
    } catch (error) {
      console.error('套用房間數失敗:', error);
      toast.error('套用房間數失敗');
    } finally {
      setSaving(false);
    }
  };

  const clearInventoryForSelectedDates = async () => {
    if (selectedDates.size === 0) {
      toast.error('請至少選擇一個日期');
      return;
    }

    try {
      setSaving(true);
      const updates = Array.from(selectedDates).map(async (dateStr) => {
        const existing = inventory[dateStr];
        
        if (existing?.id) {
          return supabase
            .from('room_inventory_pricing')
            .update({ 
              available_rooms: 0,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          return supabase
            .from('room_inventory_pricing')
            .insert({
              room_type_id: selectedRoomType,
              date: dateStr,
              available_rooms: 0,
              price: 0,
            });
        }
      });

      await Promise.all(updates);

      toast.success(`已清空 ${selectedDates.size} 個日期的庫存`);
      setIsSelectionMode(false);
      setSelectedDates(new Set());
      loadInventoryData();
    } catch (error) {
      console.error('清空庫存失敗:', error);
      toast.error('清空庫存失敗');
    } finally {
      setSaving(false);
    }
  };

  const confirmBatchEdit = async () => {
    if (!batchInventory || isNaN(parseInt(batchInventory))) {
      toast.error('請輸入有效的庫存數量');
      return;
    }

    const inventoryValue = parseInt(batchInventory);

    try {
      setSaving(true);
      const updates = Array.from(selectedDates).map(async (dateStr) => {
        const existing = inventory[dateStr];
        
        if (existing?.id) {
          return supabase
            .from('room_inventory_pricing')
            .update({ 
              available_rooms: inventoryValue,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          const roomType = roomTypes.find(rt => rt.id === selectedRoomType);
          if (!roomType) return;

          return supabase
            .from('room_inventory_pricing')
            .insert({
              room_type_id: selectedRoomType,
              date: dateStr,
              available_rooms: inventoryValue,
              price: 0,
            });
        }
      });

      await Promise.all(updates);
      
      toast.success(`已更新 ${selectedDates.size} 個日期的庫存`);
      setBatchEditDialogOpen(false);
      setBatchInventory("");
      setSelectedDates(new Set());
      setIsSelectionMode(false);
      loadInventoryData();
    } catch (error) {
      console.error('批次更新失敗:', error);
      toast.error('批次更新失敗，請重試');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyCopiedData = async () => {
    if (!copiedData) {
      toast.error('尚未複製任何設定');
      return;
    }
    
    if (selectedDates.size === 0) {
      toast.error('請至少選擇一個日期');
      return;
    }

    try {
      setSaving(true);
      const updates = Array.from(selectedDates).map(async (dateStr) => {
        const existing = inventory[dateStr];
        
        if (existing?.id) {
          return supabase
            .from('room_inventory_pricing')
            .update({ 
              available_rooms: copiedData.availableRooms,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          return supabase
            .from('room_inventory_pricing')
            .insert({
              room_type_id: selectedRoomType,
              date: dateStr,
              available_rooms: copiedData.availableRooms,
              price: 0,
            });
        }
      });

      await Promise.all(updates);

      toast.success(`已成功套用到 ${selectedDates.size} 個日期`);
      setIsSelectionMode(false);
      setSelectedDates(new Set());
      setCopiedData(null);
      loadInventoryData();
    } catch (error) {
      console.error('套用複製設定失敗:', error);
      toast.error('套用複製設定失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleSingleDateUpdate = async () => {
    if (!editingDate || !singleEditInventory) {
      toast.error('請輸入庫存數量');
      return;
    }

    try {
      setSaving(true);
      const existing = inventory[editingDate];
      
      if (existing?.id) {
        const { error } = await supabase
          .from('room_inventory_pricing')
          .update({
            available_rooms: parseInt(singleEditInventory),
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('room_inventory_pricing')
          .insert({
            room_type_id: selectedRoomType,
            date: editingDate,
            available_rooms: parseInt(singleEditInventory),
            price: 0,
          });

        if (error) throw error;
      }

      toast.success('已成功更新日期資料');
      setSingleEditDialogOpen(false);
      setEditingDate(null);
      loadInventoryData();
    } catch (error) {
      console.error('更新失敗:', error);
      toast.error('更新日期資料失敗');
    } finally {
      setSaving(false);
    }
  };

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const firstDayOfMonth = startOfMonth(currentMonth).getDay();
  const paddingDays = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const selectedRoomTypeData = roomTypes.find(rt => rt.id === selectedRoomType);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Package className="h-4 w-4 sm:h-5 sm:w-5" />
            房型選擇
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            選擇要管理庫存的房型
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && roomTypes.length === 0 ? (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex-1 w-full sm:max-w-[300px]">
                  <div className="h-10 bg-muted animate-pulse rounded-md"></div>
                </div>
                <div className="text-sm text-muted-foreground">載入中...</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex-1 w-full sm:max-w-[300px]">
                <Select value={selectedRoomType} onValueChange={setSelectedRoomType}>
                  <SelectTrigger className="h-12 sm:h-10 text-base sm:text-sm touch-manipulation">
                    <SelectValue placeholder="選擇房型" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border z-50">
                    {roomTypes.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedRoomTypeData && (
                <div className="text-xs sm:text-sm text-muted-foreground">
                  總房間數：{selectedRoomTypeData.room_count || 1} 間
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRoomType && (
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base sm:text-lg">{selectedRoomTypeData?.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    className="h-10 w-10 sm:h-9 sm:w-9 touch-manipulation"
                  >
                    <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
                  </Button>
                  <span className="font-semibold min-w-[120px] text-center text-base sm:text-sm">
                    {format(currentMonth, 'yyyy年 M月', { locale: zhTW })}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    className="h-10 w-10 sm:h-9 sm:w-9 touch-manipulation"
                  >
                    <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              </div>

              {/* 批量編輯工具列 */}
              {!isSelectionMode ? (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSelectionMode(true)}
                    className="gap-2 h-10 sm:h-9 touch-manipulation"
                  >
                    <Edit className="h-4 w-4" />
                    批量編輯
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* 提示訊息 */}
                  {isCopyMode && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                      <div className="flex items-center gap-2">
                        <Copy className="h-4 w-4" />
                        <span>請點擊一個已設定的日期來複製其庫存設定</span>
                      </div>
                    </div>
                  )}
                  
                  {copiedData && !isCopyMode && (
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary" />
                          <span className="text-primary">
                            已複製：房數 {copiedData.availableRooms}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCopiedData(null);
                            setSelectedDates(new Set());
                          }}
                          className="h-6 px-2"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-primary mt-1">請選擇要套用的目標日期</p>
                    </div>
                  )}

                  {/* 快速選擇按鈕組 */}
                  <div className="flex flex-wrap gap-2">
                    {!copiedData && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleStartCopyMode}
                        className="gap-2 h-10 sm:h-9 touch-manipulation"
                        disabled={isCopyMode}
                      >
                        <Copy className="h-4 w-4" />
                        複製設定
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectWeekends}
                      className="gap-2 h-10 sm:h-9 touch-manipulation"
                      disabled={isCopyMode}
                    >
                      <Calendar className="h-4 w-4" />
                      選擇週末
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectWeekdays}
                      className="gap-2 h-10 sm:h-9 touch-manipulation"
                      disabled={isCopyMode}
                    >
                      <Briefcase className="h-4 w-4" />
                      選擇工作日
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectCurrentWeek}
                      className="gap-2 h-10 sm:h-9 touch-manipulation"
                      disabled={isCopyMode}
                    >
                      <CalendarDays className="h-4 w-4" />
                      選擇本週
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectWholeMonth}
                      className="gap-2 h-10 sm:h-9 touch-manipulation"
                      disabled={isCopyMode}
                    >
                      <CalendarRange className="h-4 w-4" />
                      選擇整月
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSelection}
                      className="gap-2 h-10 sm:h-9 touch-manipulation"
                      disabled={selectedDates.size === 0 || isCopyMode}
                    >
                      <X className="h-4 w-4" />
                      清除選擇
                    </Button>
                  </div>

                  {/* 快速套用功能 */}
                  {selectedRoomTypeData && selectedRoomTypeData.room_count && (
                    <div className="bg-muted/30 border rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">快速套用：</span>
                          <span className="font-semibold">{selectedRoomTypeData.room_count} 間房</span>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={applyRoomCountAsInventory}
                          disabled={selectedDates.size === 0 || isCopyMode || saving}
                          className="gap-2 h-10 sm:h-9 touch-manipulation"
                        >
                          <Check className="h-4 w-4" />
                          {saving ? '套用中...' : '套用到選中日期'}
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-3 border-t">
                        <div className="flex items-center gap-2 text-sm">
                          <X className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">清空庫存</span>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={clearInventoryForSelectedDates}
                          disabled={selectedDates.size === 0 || isCopyMode || saving}
                          className="gap-2 h-10 sm:h-9 touch-manipulation"
                        >
                          <X className="h-4 w-4" />
                          {saving ? '清空中...' : '清空選中日期'}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        將選中日期的可用庫存快速設為0（適用於維護期或特殊情況）
                      </p>
                    </div>
                  )}

                  {/* 操作按鈕 */}
                  <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
                    <span className="text-sm font-medium">
                      已選擇 {selectedDates.size} 個日期
                    </span>
                    <div className="flex gap-2">
                      {copiedData && !isCopyMode ? (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleApplyCopiedData}
                          disabled={selectedDates.size === 0 || saving}
                          className="gap-2 h-11 sm:h-9 touch-manipulation"
                        >
                          <Check className="h-4 w-4" />
                          {saving ? '套用中...' : '套用複製設定'}
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleOpenBatchEdit}
                          disabled={selectedDates.size === 0 || isCopyMode}
                          className="gap-2 h-11 sm:h-9 touch-manipulation"
                        >
                          <Check className="h-4 w-4" />
                          編輯選中日期
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelSelection}
                        className="gap-2 h-11 sm:h-9 touch-manipulation"
                      >
                        <X className="h-4 w-4" />
                        取消
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                    <div
                      key={day}
                      className="text-center text-xs sm:text-sm font-medium text-muted-foreground py-1 sm:py-2"
                    >
                      {day}
                    </div>
                  ))}

                  {Array.from({ length: paddingDays }).map((_, index) => (
                    <div key={`padding-${index}`} className="min-h-[80px] sm:min-h-[90px] md:min-h-[100px]" />
                  ))}

                  {daysInMonth.map((day) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayInventory = inventory[dateStr];
                    const hasData = dayInventory !== undefined;
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isTodayDate = isToday(day);
                    const isSelected = selectedDates.has(dateStr);

                    return (
                      <div
                        key={dateStr}
                        onClick={() => toggleDateSelection(dateStr)}
                        onDoubleClick={() => handleDoubleClick(dateStr)}
                        className={cn(
                          "relative min-h-[80px] sm:min-h-[90px] md:min-h-[100px] border rounded-lg p-1.5 sm:p-2 flex flex-col items-center justify-center transition-all",
                          isTodayDate && "border-blue-600 border-2",
                          !isCurrentMonth && "opacity-50",
                          isSelectionMode && "cursor-pointer hover:scale-105",
                          !isSelectionMode && "cursor-pointer hover:scale-105 hover:shadow-md",
                          isCopyMode && hasData && "ring-2 ring-blue-400 animate-pulse",
                          isCopyMode && !hasData && "opacity-30 cursor-not-allowed",
                          isSelected && "bg-blue-100 border-blue-600 shadow-md",
                          !isSelected && hasData && "bg-blue-50 hover:bg-blue-100",
                          !isSelected && !hasData && "hover:bg-muted"
                        )}
                      >
                        <div className={cn(
                          "font-semibold mb-1 sm:mb-1.5 md:mb-2 text-sm sm:text-base",
                          isTodayDate && "text-blue-600 font-bold",
                          isSelected && "text-blue-700 font-bold"
                        )}>
                          {format(day, 'd')}
                        </div>
                        {hasData ? (
                          <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-muted-foreground">
                            <Package className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span className="font-medium">{dayInventory.availableRooms}</span>
                          </div>
                        ) : (
                          <div className="text-[10px] sm:text-xs text-muted-foreground">未設定</div>
                        )}
                        {isSelected && (
                          <div className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5">
                            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 圖例 */}
                <div className="space-y-3 mt-4 pt-4 border-t">
                  <div className="flex flex-wrap gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-50 border rounded"></div>
                      <span>已設定</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border rounded"></div>
                      <span>未設定</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 rounded"></div>
                      <span>今天</span>
                    </div>
                    {isSelectionMode && (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-blue-100 border border-blue-600 rounded"></div>
                        <span>已選擇</span>
                      </div>
                    )}
                  </div>
                  {!isSelectionMode && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                      💡 提示：雙擊日期可快速編輯當天的庫存
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* 批量編輯對話框 */}
      {isMobile ? (
        <Drawer open={batchEditDialogOpen} onOpenChange={setBatchEditDialogOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="flex flex-col gap-2">
                <span>批量編輯</span>
                <div className="flex gap-2 text-xs font-normal text-muted-foreground">
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
                    <span className="text-xs">ESC</span>
                  </kbd>
                  <span>關閉</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 ml-2">
                    <span className="text-xs">Enter</span>
                  </kbd>
                  <span>儲存</span>
                </div>
              </DrawerTitle>
              <DrawerDescription>
                將對 {selectedDates.size} 個日期進行統一設定
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-4 px-4 pb-4">
              <div className="space-y-2">
                <Label htmlFor="availableRooms">可用房數 *</Label>
                <Input
                  id="availableRooms"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="輸入可用房數"
                  value={batchInventory}
                  onChange={(e) => setBatchInventory(e.target.value)}
                  className="h-12 text-base"
                />
              </div>

              {selectedRoomTypeData && (
                <div className="text-sm text-muted-foreground">
                  提示：該房型總共有 {selectedRoomTypeData.room_count || 1} 間房
                </div>
              )}

              {/* 顯示選中的日期 */}
              <div className="border rounded-lg p-3 bg-muted/50">
                <p className="text-sm font-medium mb-2">選中的日期：</p>
                <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground">
                  {Array.from(selectedDates).sort().map(date => (
                    <div key={date}>{format(parseISO(date), 'yyyy年 M月 d日', { locale: zhTW })}</div>
                  ))}
                </div>
              </div>
            </div>

            <DrawerFooter className="flex-col gap-2 pt-2">
              <Button
                onClick={confirmBatchEdit}
                disabled={saving || !batchInventory}
                className="w-full h-12"
              >
                {saving ? '更新中...' : '確認更新'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setBatchEditDialogOpen(false)}
                disabled={saving}
                className="w-full h-12"
              >
                取消
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={batchEditDialogOpen} onOpenChange={setBatchEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>批量編輯</span>
                <div className="flex gap-2 text-xs font-normal text-muted-foreground">
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
                    <span className="text-xs">ESC</span>
                  </kbd>
                  <span>關閉</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 ml-2">
                    <span className="text-xs">Enter</span>
                  </kbd>
                  <span>儲存</span>
                </div>
              </CardTitle>
              <DialogDescription>
                將對 {selectedDates.size} 個日期進行統一設定
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="availableRooms">可用房數 *</Label>
                <Input
                  id="availableRooms"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="輸入可用房數"
                  value={batchInventory}
                  onChange={(e) => setBatchInventory(e.target.value)}
                />
              </div>

              {selectedRoomTypeData && (
                <div className="text-sm text-muted-foreground">
                  提示：該房型總共有 {selectedRoomTypeData.room_count || 1} 間房
                </div>
              )}

              {/* 顯示選中的日期 */}
              <div className="border rounded-lg p-3 bg-muted/50">
                <p className="text-sm font-medium mb-2">選中的日期：</p>
                <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground">
                  {Array.from(selectedDates).sort().map(date => (
                    <div key={date}>{format(parseISO(date), 'yyyy年 M月 d日', { locale: zhTW })}</div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setBatchEditDialogOpen(false)}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                取消
              </Button>
              <Button
                onClick={confirmBatchEdit}
                disabled={saving || !batchInventory}
                className="w-full sm:w-auto"
              >
                {saving ? '更新中...' : '確認更新'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 單日期編輯對話框 */}
      {isMobile ? (
        <Drawer open={singleEditDialogOpen} onOpenChange={setSingleEditDialogOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="flex flex-col gap-2">
                <span>編輯日期</span>
                <div className="flex gap-2 text-xs font-normal text-muted-foreground">
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
                    <span className="text-xs">ESC</span>
                  </kbd>
                  <span>關閉</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 ml-2">
                    <span className="text-xs">Enter</span>
                  </kbd>
                  <span>儲存</span>
                </div>
              </DrawerTitle>
              <DrawerDescription>
                {editingDate && format(parseISO(editingDate), 'yyyy年 M月 d日（EEEE）', { locale: zhTW })}
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-4 px-4 pb-4">
              <div className="space-y-2">
                <Label htmlFor="single-availableRooms">可用房數 *</Label>
                <Input
                  id="single-availableRooms"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="輸入可用房數"
                  value={singleEditInventory}
                  onChange={(e) => setSingleEditInventory(e.target.value)}
                  className="h-12 text-base"
                />
              </div>

              {selectedRoomTypeData && (
                <div className="text-sm text-muted-foreground">
                  提示：該房型總共有 {selectedRoomTypeData.room_count || 1} 間房
                </div>
              )}
            </div>

            <DrawerFooter className="flex-col gap-2 pt-2">
              <Button
                onClick={handleSingleDateUpdate}
                disabled={saving || !singleEditInventory}
                className="w-full h-12"
              >
                {saving ? '更新中...' : '確認更新'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setSingleEditDialogOpen(false)}
                disabled={saving}
                className="w-full h-12"
              >
                取消
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={singleEditDialogOpen} onOpenChange={setSingleEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>編輯日期</span>
                <div className="flex gap-2 text-xs font-normal text-muted-foreground">
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
                    <span className="text-xs">ESC</span>
                  </kbd>
                  <span>關閉</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 ml-2">
                    <span className="text-xs">Enter</span>
                  </kbd>
                  <span>儲存</span>
                </div>
              </CardTitle>
              <DialogDescription>
                {editingDate && format(parseISO(editingDate), 'yyyy年 M月 d日（EEEE）', { locale: zhTW })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="single-availableRooms">可用房數 *</Label>
                <Input
                  id="single-availableRooms"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="輸入可用房數"
                  value={singleEditInventory}
                  onChange={(e) => setSingleEditInventory(e.target.value)}
                />
              </div>

              {selectedRoomTypeData && (
                <div className="text-sm text-muted-foreground">
                  提示：該房型總共有 {selectedRoomTypeData.room_count || 1} 間房
                </div>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setSingleEditDialogOpen(false)}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                取消
              </Button>
              <Button
                onClick={handleSingleDateUpdate}
                disabled={saving || !singleEditInventory}
                className="w-full sm:w-auto"
              >
                {saving ? '更新中...' : '確認更新'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
