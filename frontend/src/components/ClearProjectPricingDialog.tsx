import { useState, useEffect } from "react";
import { format, addDays, parseISO } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Calendar as CalendarIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RoomType {
  id: string;
  name: string;
}

interface ClearProjectPricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accommodationId: string;
  roomTypes: RoomType[];
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

export function ClearProjectPricingDialog({
  open,
  onOpenChange,
  accommodationId,
  roomTypes,
  onComplete,
}: ClearProjectPricingDialogProps) {
  const [allDates, setAllDates] = useState(false);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>("all");
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set(['0', '1', '2', '3', '4', '5', '6']));
  const [excludeHolidays, setExcludeHolidays] = useState(false);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [affectedCount, setAffectedCount] = useState(0);

  useEffect(() => {
    if (open) {
      setAllDates(false);
      setStartDate(new Date());
      setEndDate(new Date());
      setSelectedRoomTypeId("all");
      setSelectedDays(new Set(['0', '1', '2', '3', '4', '5', '6']));
      setExcludeHolidays(false);
      loadHolidays();
    }
  }, [open]);

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
      setSelectedDays(prev => prev.size === 7 ? new Set() : new Set(['0', '1', '2', '3', '4', '5', '6']));
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

  // 計算符合條件的日期
  const getMatchingDates = (): string[] | 'all' => {
    if (allDates) return 'all';
    const dates: string[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const dayOfWeek = currentDate.getDay().toString();

      if (selectedDays.has(dayOfWeek)) {
        if (!(excludeHolidays && holidays.has(dateStr))) {
          dates.push(dateStr);
        }
      }
      currentDate = addDays(currentDate, 1);
    }
    return dates;
  };

  const handlePreConfirm = () => {
    const result = getMatchingDates();
    if (result !== 'all' && result.length === 0) {
      toast.error('沒有符合條件的日期');
      return;
    }
    setAffectedCount(result === 'all' ? -1 : result.length);
    setConfirmOpen(true);
  };

  const handleClear = async () => {
    try {
      setSaving(true);
      const result = getMatchingDates();

      const roomTypeIds = selectedRoomTypeId === "all"
        ? roomTypes.map(r => r.id)
        : [selectedRoomTypeId];

      for (const rtId of roomTypeIds) {
        if (result === 'all') {
          // 預先標記變更來源，讓 audit log 觸發器能紀錄 project_clear
          await supabase
            .from('room_inventory_pricing')
            .update({ last_change_source: 'project_clear' })
            .eq('room_type_id', rtId);
          const { error } = await supabase
            .from('room_inventory_pricing')
            .delete()
            .eq('room_type_id', rtId);
          if (error) throw error;
        } else {
          if (result.length === 0) {
            toast.error('沒有符合條件的日期');
            return;
          }
          await supabase
            .from('room_inventory_pricing')
            .update({ last_change_source: 'project_clear' })
            .eq('room_type_id', rtId)
            .in('date', result);
          const { error } = await supabase
            .from('room_inventory_pricing')
            .delete()
            .eq('room_type_id', rtId)
            .in('date', result);
          if (error) throw error;
        }
      }

      const roomLabel = selectedRoomTypeId === "all"
        ? "全部房型"
        : roomTypes.find(r => r.id === selectedRoomTypeId)?.name || "";

      const dateLabel = result === 'all' ? '所有日期' : `${result.length} 天`;
      toast.success(`已清除「${roomLabel}」${dateLabel}的專案房價`);
      setConfirmOpen(false);
      onOpenChange(false);
      onComplete();
    } catch (error) {
      console.error('清除房價失敗:', error);
      toast.error('清除房價失敗');
    } finally {
      setSaving(false);
    }
  };

  const selectedRoomLabel = selectedRoomTypeId === "all"
    ? "全部房型"
    : roomTypes.find(r => r.id === selectedRoomTypeId)?.name || "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              清除專案房價
            </DialogTitle>
            <DialogDescription>
              選擇日期區間與條件，清除該範圍內的庫存與價格資料
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* 房型選擇 */}
            <div className="space-y-2">
              <Label>選擇房型</Label>
              <Select value={selectedRoomTypeId} onValueChange={setSelectedRoomTypeId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="選擇房型" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="all">全部房型</SelectItem>
                  {roomTypes.map(rt => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 日期範圍 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="allDates"
                  checked={allDates}
                  onCheckedChange={(checked) => setAllDates(checked === true)}
                />
                <label htmlFor="allDates" className="text-sm cursor-pointer font-medium">
                  所有日期
                </label>
              </div>

              {!allDates && (
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
                          {format(startDate, 'yyyy-MM-dd')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          defaultMonth={startDate}
                          onSelect={(date) => {
                            if (!date) return;
                            setStartDate(date);
                            if (endDate && endDate < date) setEndDate(date);
                          }}
                          variant="backend"
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
                          {format(endDate, 'yyyy-MM-dd')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          defaultMonth={endDate ?? startDate}
                          onSelect={(date) => date && setEndDate(date)}
                          variant="backend"
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </div>

            {/* 篩選星期 */}
            {!allDates && (
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
            )}

            {/* 排除國定假日 */}
            {!allDates && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="clearExcludeHolidays"
                  checked={excludeHolidays}
                  onCheckedChange={(checked) => setExcludeHolidays(checked === true)}
                />
                <label htmlFor="clearExcludeHolidays" className="text-sm cursor-pointer">
                  排除國定假日
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handlePreConfirm}>
              清除房價
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 確認對話框 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認清除專案房價</AlertDialogTitle>
            <AlertDialogDescription>
              {allDates
                ? <>即將清除「{selectedRoomLabel}」所有日期的庫存與價格資料。</>
                : <>即將清除「{selectedRoomLabel}」在 {format(startDate, 'yyyy-MM-dd')} 至 {format(endDate, 'yyyy-MM-dd')} 期間共 {affectedCount} 天的庫存與價格資料。</>
              }
              <br /><br />
              <span className="text-destructive font-medium">此操作無法復原，請確認是否繼續？</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClear}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? '清除中...' : '確定清除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
