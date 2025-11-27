import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, ChevronLeft, ChevronRight, Check, Edit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths } from "date-fns";
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
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [selectedRoomType, setSelectedRoomType] = useState<string>("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [inventory, setInventory] = useState<InventoryData>({});
  const [loading, setLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false);
  const [batchInventory, setBatchInventory] = useState("");

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

    const newSelected = new Set(selectedDates);
    if (newSelected.has(dateStr)) {
      newSelected.delete(dateStr);
    } else {
      newSelected.add(dateStr);
    }
    setSelectedDates(newSelected);
  };

  const handleBatchEdit = () => {
    if (selectedDates.size === 0) {
      toast.error('請先選擇要編輯的日期');
      return;
    }
    setBatchEditDialogOpen(true);
  };

  const confirmBatchEdit = async () => {
    if (!batchInventory || isNaN(parseInt(batchInventory))) {
      toast.error('請輸入有效的庫存數量');
      return;
    }

    const inventoryValue = parseInt(batchInventory);

    try {
      const updates = Array.from(selectedDates).map(async (dateStr) => {
        const existing = inventory[dateStr];
        
        if (existing?.id) {
          // 更新現有記錄
          return supabase
            .from('room_inventory_pricing')
            .update({ 
              available_rooms: inventoryValue,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          // 創建新記錄 - 需要價格資訊
          const roomType = roomTypes.find(rt => rt.id === selectedRoomType);
          if (!roomType) return;

          return supabase
            .from('room_inventory_pricing')
            .insert({
              room_type_id: selectedRoomType,
              date: dateStr,
              available_rooms: inventoryValue,
              price: 0, // 預設價格為0
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            房型選擇
          </CardTitle>
          <CardDescription>
            選擇要管理庫存的房型
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex-1 w-full sm:max-w-[300px]">
              <Select value={selectedRoomType} onValueChange={setSelectedRoomType}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇房型" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedRoomTypeData && (
              <div className="text-sm text-muted-foreground">
                總房間數：{selectedRoomTypeData.room_count || 1} 間
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedRoomType && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle>庫存管理</CardTitle>
                <CardDescription>
                  設定每日可用房間數量
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                {!isSelectionMode ? (
                  <Button
                    onClick={() => setIsSelectionMode(true)}
                    variant="outline"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    批次編輯
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleBatchEdit}
                      disabled={selectedDates.size === 0}
                    >
                      編輯選中日期 ({selectedDates.size})
                    </Button>
                    <Button
                      onClick={() => {
                        setIsSelectionMode(false);
                        setSelectedDates(new Set());
                      }}
                      variant="outline"
                    >
                      取消選擇
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex items-center justify-between">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-lg font-semibold">
                {format(currentMonth, 'yyyy年 MM月', { locale: zhTW })}
              </h3>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
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
                      className={cn(
                        "relative min-h-[80px] sm:min-h-[90px] md:min-h-[100px] border rounded-lg p-1.5 sm:p-2 flex flex-col items-center justify-center transition-all",
                        isTodayDate && "border-blue-600 border-2",
                        !isCurrentMonth && "opacity-50",
                        isSelectionMode && "cursor-pointer hover:scale-105",
                        isSelected && "bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-500"
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
                        <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs">
                          <Package className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                          <span className="font-medium">{dayInventory.availableRooms} 間</span>
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
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={batchEditDialogOpen} onOpenChange={setBatchEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批次編輯庫存</DialogTitle>
            <DialogDescription>
              設定選中 {selectedDates.size} 個日期的庫存數量
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="batch-inventory">可用房間數量</Label>
              <Input
                id="batch-inventory"
                type="number"
                min="0"
                value={batchInventory}
                onChange={(e) => setBatchInventory(e.target.value)}
                placeholder="輸入庫存數量"
              />
            </div>
            {selectedRoomTypeData && (
              <div className="text-sm text-muted-foreground">
                提示：該房型總共有 {selectedRoomTypeData.room_count || 1} 間房
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={confirmBatchEdit}>
              確認更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
