import { useState, useEffect } from "react";
import { format, addDays, parseISO, isWeekend as isWeekendDate } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RoomPriceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomTypeId: string;
  roomTypeName: string;
  templateName?: string;
  initialDate: string;
  currentPrice?: number;
  accommodationId: string;
  onComplete: () => void;
}

const weekDays = [
  { id: 'all', label: '全選' },
  { id: '0', label: '日' },
  { id: '1', label: '一' },
  { id: '2', label: '二' },
  { id: '3', label: '三' },
  { id: '4', label: '四' },
  { id: '5', label: '五' },
  { id: '6', label: '六' },
];

export function RoomPriceEditDialog({
  open,
  onOpenChange,
  roomTypeId,
  roomTypeName,
  templateName,
  initialDate,
  currentPrice,
  accommodationId,
  onComplete,
}: RoomPriceEditDialogProps) {
  const [startDate, setStartDate] = useState<Date>(parseISO(initialDate));
  const [endDate, setEndDate] = useState<Date>(parseISO(initialDate));
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set(['0', '1', '2', '3', '4', '5', '6']));
  const [excludeHolidays, setExcludeHolidays] = useState(false);
  const [changePrice, setChangePrice] = useState(false);
  const [customPrice, setCustomPrice] = useState(currentPrice?.toString() || '');
  const [changeAvailability, setChangeAvailability] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [changeInventory, setChangeInventory] = useState(false);
  const [inventoryCount, setInventoryCount] = useState('1');
  const [saving, setSaving] = useState(false);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());

  // 載入假日
  useEffect(() => {
    if (open && accommodationId) {
      loadHolidays();
    }
  }, [open, accommodationId]);

  // 重置狀態
  useEffect(() => {
    if (open) {
      setStartDate(parseISO(initialDate));
      setEndDate(parseISO(initialDate));
      setSelectedDays(new Set(['0', '1', '2', '3', '4', '5', '6']));
      setExcludeHolidays(false);
      setChangePrice(false);
      setCustomPrice(currentPrice?.toString() || '');
      setChangeAvailability(false);
      setIsAvailable(true);
      setChangeInventory(false);
      setInventoryCount('1');
    }
  }, [open, initialDate, currentPrice]);

  const loadHolidays = async () => {
    try {
      const { data, error } = await supabase
        .from('public_holidays')
        .select('holiday_date, holiday_type')
        .eq('accommodation_id', accommodationId)
        .in('holiday_type', ['holiday', 'compensatory_day_off']);

      if (error) throw error;
      setHolidays(new Set(data?.map(h => h.holiday_date) || []));
    } catch (error) {
      console.error('載入假日失敗:', error);
    }
  };

  const handleDayToggle = (dayId: string) => {
    if (dayId === 'all') {
      if (selectedDays.size === 7) {
        setSelectedDays(new Set());
      } else {
        setSelectedDays(new Set(['0', '1', '2', '3', '4', '5', '6']));
      }
      return;
    }

    const newDays = new Set(selectedDays);
    if (newDays.has(dayId)) {
      newDays.delete(dayId);
    } else {
      newDays.add(dayId);
    }
    setSelectedDays(newDays);
  };

  const handleSave = async () => {
    if (!changePrice && !changeAvailability && !changeInventory) {
      toast.error('請至少選擇一項變更設定');
      return;
    }

    if (changePrice && !customPrice) {
      toast.error('請輸入價格');
      return;
    }

    try {
      setSaving(true);

      // 計算符合條件的日期
      const datesToUpdate: string[] = [];
      let currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const dayOfWeek = currentDate.getDay().toString();

        // 檢查星期過濾
        if (!selectedDays.has(dayOfWeek)) {
          currentDate = addDays(currentDate, 1);
          continue;
        }

        // 檢查假日排除
        if (excludeHolidays && holidays.has(dateStr)) {
          currentDate = addDays(currentDate, 1);
          continue;
        }

        datesToUpdate.push(dateStr);
        currentDate = addDays(currentDate, 1);
      }

      if (datesToUpdate.length === 0) {
        toast.error('沒有符合條件的日期');
        return;
      }

      // 構建更新數據
      const updates = datesToUpdate.map(date => {
        const updateData: any = {
          room_type_id: roomTypeId,
          date,
        };

        if (changePrice) {
          updateData.price = parseInt(customPrice);
        }

        if (changeAvailability) {
          updateData.is_available = isAvailable;
        }

        if (changeInventory) {
          updateData.available_rooms = parseInt(inventoryCount);
        }

        return updateData;
      });

      // 先獲取現有記錄
      const { data: existingData, error: fetchError } = await supabase
        .from('room_inventory_pricing')
        .select('id, date')
        .eq('room_type_id', roomTypeId)
        .in('date', datesToUpdate);

      if (fetchError) throw fetchError;

      const existingDates = new Set(existingData?.map(d => d.date) || []);

      // 分離需要更新和插入的記錄
      const toUpdate = updates.filter(u => existingDates.has(u.date));
      const toInsert = updates.filter(u => !existingDates.has(u.date)).map(u => ({
        ...u,
        price: u.price || parseInt(customPrice) || currentPrice || 0,
        available_rooms: 1,
        is_available: u.is_available ?? true,
      }));

      // 批量更新
      if (toUpdate.length > 0) {
        for (const update of toUpdate) {
          const { error } = await supabase
            .from('room_inventory_pricing')
            .update(update)
            .eq('room_type_id', roomTypeId)
            .eq('date', update.date);

          if (error) throw error;
        }
      }

      // 批量插入新記錄
      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('room_inventory_pricing')
          .insert(toInsert);

        if (error) throw error;
      }

      toast.success(`已更新 ${datesToUpdate.length} 個日期的設定`);
      onComplete();
    } catch (error) {
      console.error('儲存失敗:', error);
      toast.error('儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const title = templateName 
    ? `${roomTypeName} - ${templateName}`
    : roomTypeName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            批次設定選定日期範圍的價格與販售狀態
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 日期範圍 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>開始日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'yyyy-MM-dd') : '選擇日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>結束日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'yyyy-MM-dd') : '選擇日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* 篩選星期 */}
          <div className="space-y-2">
            <Label>篩選星期</Label>
            <div className="flex flex-wrap gap-2">
              {weekDays.map(day => (
                <label
                  key={day.id}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <Checkbox
                    checked={day.id === 'all' ? selectedDays.size === 7 : selectedDays.has(day.id)}
                    onCheckedChange={() => handleDayToggle(day.id)}
                  />
                  <span className="text-sm">{day.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 排除國定假日 */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="excludeHolidays"
              checked={excludeHolidays}
              onCheckedChange={(checked) => setExcludeHolidays(checked === true)}
            />
            <label htmlFor="excludeHolidays" className="text-sm cursor-pointer">
              排除國定假日
              <span className="text-muted-foreground ml-1">
                (套用後將自動排除國定假日及國定假日前一日)
              </span>
            </label>
          </div>

          {/* 變更設定 */}
          <div className="space-y-4">
            <Label className="text-muted-foreground">變更設定</Label>

            {/* 變更專案價格 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="changePrice"
                  checked={changePrice}
                  onCheckedChange={(checked) => setChangePrice(checked === true)}
                />
                <label htmlFor="changePrice" className="text-sm cursor-pointer font-medium">
                  變更專案價格
                </label>
              </div>

              {changePrice && (
                <div className="ml-6 flex items-center gap-2">
                  <Label htmlFor="customPrice" className="text-sm">
                    價格設定
                  </Label>
                  <Input
                    id="customPrice"
                    type="number"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="w-32"
                    placeholder={currentPrice?.toString()}
                  />
                </div>
              )}
            </div>

            {/* 變更房型販售狀態 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="changeAvailability"
                  checked={changeAvailability}
                  onCheckedChange={(checked) => setChangeAvailability(checked === true)}
                />
                <label htmlFor="changeAvailability" className="text-sm cursor-pointer font-medium">
                  變更房型販售狀態
                </label>
              </div>

              {changeAvailability && (
                <div className="ml-6">
                  <RadioGroup 
                    value={isAvailable ? 'open' : 'close'} 
                    onValueChange={(v) => setIsAvailable(v === 'open')}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="open" id="open" />
                      <label htmlFor="open" className="text-sm cursor-pointer">開啟</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="close" id="close" />
                      <label htmlFor="close" className="text-sm cursor-pointer">關閉</label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '儲存中...' : '確定'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
