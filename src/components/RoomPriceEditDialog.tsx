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
  templateId?: string;
  templateName?: string;
  initialDate: string;
  currentPrice?: number;
  currentAvailableRooms?: number;
  templatePrice?: number;
  isOverridden?: boolean;
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
  templateId,
  templateName,
  initialDate,
  currentPrice,
  currentAvailableRooms,
  templatePrice,
  isOverridden,
  accommodationId,
  onComplete,
}: RoomPriceEditDialogProps) {
  const [startDate, setStartDate] = useState<Date>(parseISO(initialDate));
  const [endDate, setEndDate] = useState<Date>(parseISO(initialDate));
  const [startPopoverOpen, setStartPopoverOpen] = useState(false);
  const [endPopoverOpen, setEndPopoverOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set(['0', '1', '2', '3', '4', '5', '6']));
  const [excludeHolidays, setExcludeHolidays] = useState(false);
  const [changePrice, setChangePrice] = useState(false);
  const [customPrice, setCustomPrice] = useState(currentPrice?.toString() || '');
  const [changeAvailability, setChangeAvailability] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [changeInventory, setChangeInventory] = useState(false);
  const [inventoryCount, setInventoryCount] = useState(currentAvailableRooms?.toString() || '1');
  const [resetToTemplate, setResetToTemplate] = useState(false);
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
      setInventoryCount(currentAvailableRooms?.toString() || '1');
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

      // 1) 處理「庫存/販售狀態」與「無 template 時的價格變更」→ 寫入 pricing_template_id IS NULL 的列
      const baseUpdates = datesToUpdate.map(date => {
        const updateData: any = {
          room_type_id: roomTypeId,
          date,
          pricing_template_id: null,
        };

        // 只有在「未綁定專案」時，價格變更才寫入基礎價列
        if (changePrice && !templateId) {
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

      const needBaseWrite = changeAvailability || changeInventory || (changePrice && !templateId);

      if (needBaseWrite) {
        // 取得既有的基礎價列
        const { data: existingBase, error: fetchBaseError } = await supabase
          .from('room_inventory_pricing')
          .select('id, date')
          .eq('room_type_id', roomTypeId)
          .is('pricing_template_id', null)
          .in('date', datesToUpdate);

        if (fetchBaseError) throw fetchBaseError;
        const existingBaseDates = new Set((existingBase || []).map(d => d.date));

        const baseToUpdate = baseUpdates.filter(u => existingBaseDates.has(u.date));
        const baseToInsert = baseUpdates
          .filter(u => !existingBaseDates.has(u.date))
          .map(u => ({
            ...u,
            price: u.price ?? currentPrice ?? 0,
            available_rooms: u.available_rooms ?? 1,
            is_available: u.is_available ?? true,
            last_change_source: 'manual_edit' as const,
          }));

        for (const update of baseToUpdate) {
          const { error } = await supabase
            .from('room_inventory_pricing')
            .update({ ...update, last_change_source: 'manual_edit' })
            .eq('room_type_id', roomTypeId)
            .eq('date', update.date)
            .is('pricing_template_id', null);
          if (error) throw error;
        }

        if (baseToInsert.length > 0) {
          const { error } = await supabase
            .from('room_inventory_pricing')
            .insert(baseToInsert);
          if (error) throw error;
        }
      }

      // 2) 處理「專案價格覆寫」→ 寫入 pricing_template_id = templateId 的列
      // 註：partial unique index 無法被 ON CONFLICT 推斷，需手動 select → update/insert
      console.log('[RoomPriceEditDialog] save', { changePrice, templateId, datesToUpdate, customPrice });
      if (changePrice && templateId) {
        const priceValue = parseInt(customPrice);

        const { data: existingOverride, error: fetchOverrideError } = await supabase
          .from('room_inventory_pricing')
          .select('id, date')
          .eq('room_type_id', roomTypeId)
          .eq('pricing_template_id', templateId)
          .in('date', datesToUpdate);

        if (fetchOverrideError) throw fetchOverrideError;
        const existingOverrideDates = new Set((existingOverride || []).map(d => d.date));

        const overrideToUpdate = datesToUpdate.filter(d => existingOverrideDates.has(d));
        const overrideToInsert = datesToUpdate
          .filter(d => !existingOverrideDates.has(d))
          .map(date => ({
            room_type_id: roomTypeId,
            date,
            pricing_template_id: templateId,
            price: priceValue,
            available_rooms: 0,
            is_available: true,
            last_change_source: 'template_apply' as const,
          }));

        for (const date of overrideToUpdate) {
          const { error } = await supabase
            .from('room_inventory_pricing')
            .update({ price: priceValue, last_change_source: 'template_apply' })
            .eq('room_type_id', roomTypeId)
            .eq('date', date)
            .eq('pricing_template_id', templateId);
          if (error) throw error;
        }

        if (overrideToInsert.length > 0) {
          const { error } = await supabase
            .from('room_inventory_pricing')
            .insert(overrideToInsert);
          if (error) throw error;
        }
        console.log('[RoomPriceEditDialog] override write done', {
          updated: overrideToUpdate.length,
          inserted: overrideToInsert.length,
        });
      }

      const summary = changePrice && templateId
        ? `已更新 ${datesToUpdate.length} 個日期的「${templateName ?? '專案'}」價格`
        : `已更新 ${datesToUpdate.length} 個日期的設定`;
      toast.success(summary);
      onComplete();
    } catch (error: any) {
      console.error('儲存失敗:', error);
      toast.error(`儲存失敗：${error?.message ?? '未知錯誤'}`);
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
              <Popover open={startPopoverOpen} onOpenChange={setStartPopoverOpen}>
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
                    defaultMonth={startDate}
                    onSelect={(date) => {
                      if (date) {
                        setStartDate(date);
                        if (endDate < date) setEndDate(date);
                        setStartPopoverOpen(false);
                        setTimeout(() => setEndPopoverOpen(true), 150);
                      }
                    }}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>結束日期</Label>
              <Popover open={endPopoverOpen} onOpenChange={setEndPopoverOpen}>
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
                    defaultMonth={endDate ?? startDate}
                    onSelect={(date) => {
                      if (date) {
                        setEndDate(date);
                        setEndPopoverOpen(false);
                      }
                    }}
                    initialFocus
                    className="pointer-events-auto"
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
                  {templateId ? '變更此專案價格' : '變更基礎價格'}
                </label>
              </div>

              {changePrice && (
                <div className="ml-6 space-y-2">
                  <div className="flex items-center gap-2">
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
                  <p className="text-xs text-muted-foreground">
                    {templateId
                      ? '僅覆寫此專案在所選日期的售價，不影響其他專案。'
                      : '更新基礎價格，不影響各專案的覆寫價。'}
                  </p>
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

            {/* 變更庫存量 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="changeInventory"
                  checked={changeInventory}
                  onCheckedChange={(checked) => setChangeInventory(checked === true)}
                />
                <label htmlFor="changeInventory" className="text-sm cursor-pointer font-medium">
                  變更庫存量
                </label>
              </div>

              {changeInventory && (
                <div className="ml-6 flex items-center gap-2">
                  <Label htmlFor="inventoryCount" className="text-sm">
                    庫存數量
                  </Label>
                  <Input
                    id="inventoryCount"
                    type="number"
                    min="0"
                    value={inventoryCount}
                    onChange={(e) => setInventoryCount(e.target.value)}
                    className="w-32"
                    placeholder="1"
                  />
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
