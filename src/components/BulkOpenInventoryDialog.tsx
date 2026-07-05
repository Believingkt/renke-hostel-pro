import { useState, useMemo, useEffect } from "react";
import { format, eachDayOfInterval } from "date-fns";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RoomTypeOption {
  id: string;
  name: string;
  is_exclusive_package: boolean;
  base_price: number;
  room_count: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accommodationId: string;
  roomTypes: RoomTypeOption[];
  defaultStart?: Date;
  defaultEnd?: Date;
  onComplete: () => void;
}

type ValueMode = "default" | "custom";
type OverwriteMode = "skip" | "overwrite" | "overwrite_status_only";
type OperationMode = "open" | "close";

export function BulkOpenInventoryDialog({
  open,
  onOpenChange,
  accommodationId,
  roomTypes,
  defaultStart,
  defaultEnd,
  onComplete,
}: Props) {
  const [startDate, setStartDate] = useState<Date | undefined>(defaultStart);
  const [endDate, setEndDate] = useState<Date | undefined>(defaultEnd);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [operationMode, setOperationMode] = useState<OperationMode>("open");
  const [valueMode, setValueMode] = useState<ValueMode>("default");
  const [customValue, setCustomValue] = useState<string>("1");
  const [overwriteMode, setOverwriteMode] = useState<OverwriteMode>("skip");
  const [changePrice, setChangePrice] = useState<boolean>(false);
  const [priceValue, setPriceValue] = useState<string>("");

  const [step, setStep] = useState<1 | 2>(1);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);
  const [insertCount, setInsertCount] = useState(0);

  useEffect(() => {
    if (open) {
      setStartDate(defaultStart);
      setEndDate(defaultEnd);
      setSelectedRoomIds(new Set());
      setOperationMode("open");
      setValueMode("default");
      setCustomValue("1");
      setOverwriteMode("skip");
      setChangePrice(false);
      setPriceValue("");
      setStep(1);
      setConflictCount(0);
      setInsertCount(0);
    }
  }, [open, defaultStart, defaultEnd]);

  const dateList = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return [] as string[];
    return eachDayOfInterval({ start: startDate, end: endDate }).map((d) => format(d, "yyyy-MM-dd"));
  }, [startDate, endDate]);

  const totalCells = dateList.length * selectedRoomIds.size;

  const toggleRoom = (id: string) => {
    const next = new Set(selectedRoomIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRoomIds(next);
  };

  const selectAll = () => setSelectedRoomIds(new Set(roomTypes.map((r) => r.id)));
  const clearAll = () => setSelectedRoomIds(new Set());

  const handleScan = async () => {
    if (dateList.length === 0) {
      toast.error("請選擇有效的日期區間");
      return;
    }
    if (selectedRoomIds.size === 0) {
      toast.error("請至少選擇一個房型");
      return;
    }
    if (valueMode === "custom") {
      const n = parseInt(customValue, 10);
      if (isNaN(n) || n < 0) {
        toast.error("請輸入有效的庫存數字");
        return;
      }
    }
    if (changePrice) {
      const p = parseInt(priceValue, 10);
      if (isNaN(p) || p < 0) {
        toast.error("請輸入有效的價格");
        return;
      }
    }

    setScanning(true);
    try {
      const roomIds = Array.from(selectedRoomIds);
      const PAGE = 1000;
      const all: { room_type_id: string; date: string }[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("room_inventory_pricing")
          .select("room_type_id, date")
          .in("room_type_id", roomIds)
          .gte("date", dateList[0])
          .lte("date", dateList[dateList.length - 1])
          .is("pricing_template_id", null)
          .order("date", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const dateSet = new Set(dateList);
      const existing = all.filter((r) => dateSet.has(r.date));
      setConflictCount(existing.length);
      setInsertCount(totalCells - existing.length);
      setStep(2);
    } catch (e) {
      console.error(e);
      toast.error("掃描現有資料失敗");
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const roomMap = new Map(roomTypes.map((r) => [r.id, r]));
      const roomIds = Array.from(selectedRoomIds);

      // 已存在 rows（分頁抓完，避免 1000 上限漏掉導致 upsert/insert 撞唯一索引）
      const PAGE = 1000;
      const existingAll: { id: string; room_type_id: string; date: string; available_rooms: number; is_available: boolean }[] = [];
      {
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from("room_inventory_pricing")
            .select("id, room_type_id, date, available_rooms, is_available")
            .in("room_type_id", roomIds)
            .gte("date", dateList[0])
            .lte("date", dateList[dateList.length - 1])
            .is("pricing_template_id", null)
            .order("date", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          existingAll.push(...(data as any));
          if (data.length < PAGE) break;
          from += PAGE;
        }
      }

      const dateSet = new Set(dateList);
      const existingMap = new Map<string, { id: string; available_rooms: number; is_available: boolean }>();
      existingAll.forEach((r) => {
        if (dateSet.has(r.date)) {
          existingMap.set(`${r.room_type_id}_${r.date}`, {
            id: r.id,
            available_rooms: r.available_rooms,
            is_available: r.is_available,
          });
        }
      });

      const isClose = operationMode === "close";
      const sourceTag = isClose ? "bulk_close" : "bulk_open";
      const overridePrice = changePrice ? parseInt(priceValue, 10) : null;

      const inserts: any[] = [];
      const updates: { id: string; available_rooms: number; keep_rooms: boolean }[] = [];

      for (const rid of roomIds) {
        const rt = roomMap.get(rid);
        if (!rt) continue;
        const value = isClose
          ? 0
          : valueMode === "default"
            ? rt.room_count ?? 1
            : parseInt(customValue, 10);

        for (const dateStr of dateList) {
          const key = `${rid}_${dateStr}`;
          const existing = existingMap.get(key);
          if (existing) {
            if (overwriteMode === "overwrite") {
              updates.push({ id: existing.id, available_rooms: value, keep_rooms: false });
            } else if (overwriteMode === "overwrite_status_only") {
              updates.push({ id: existing.id, available_rooms: existing.available_rooms, keep_rooms: true });
            }
            // skip 模式 → 不處理（若同時勾選變更價格，仍會更新價格，見下方）
          } else {
            inserts.push({
              room_type_id: rid,
              date: dateStr,
              price: overridePrice ?? rt.base_price ?? 0,
              available_rooms: value,
              is_available: !isClose,
              pricing_template_id: null,
              last_change_source: sourceTag,
            });
          }
        }
      }

      // 批次插入（分塊以避免單次 payload 過大）
      const CHUNK = 500;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const chunk = inserts.slice(i, i + CHUNK);
        const { error } = await supabase.from("room_inventory_pricing").insert(chunk);
        if (error) throw error;
      }

      // 批次更新（狀態 / 可售數 / 價格）
      let priceUpdatedCount = 0;
      for (const u of updates) {
        const patch: any = { is_available: !isClose, last_change_source: sourceTag };
        if (!u.keep_rooms) patch.available_rooms = u.available_rooms;
        if (overridePrice !== null) {
          patch.price = overridePrice;
          priceUpdatedCount++;
        }
        const { error } = await supabase
          .from("room_inventory_pricing")
          .update(patch)
          .eq("id", u.id);
        if (error) throw error;
      }

      // skip 模式下若勾選了變更價格，仍要更新既有列的價格
      if (overridePrice !== null && overwriteMode === "skip") {
        const skippedIds: string[] = [];
        for (const rid of roomIds) {
          for (const dateStr of dateList) {
            const existing = existingMap.get(`${rid}_${dateStr}`);
            if (existing) skippedIds.push(existing.id);
          }
        }
        for (let i = 0; i < skippedIds.length; i += CHUNK) {
          const chunkIds = skippedIds.slice(i, i + CHUNK);
          const { error } = await supabase
            .from("room_inventory_pricing")
            .update({ price: overridePrice, last_change_source: sourceTag })
            .in("id", chunkIds);
          if (error) throw error;
          priceUpdatedCount += chunkIds.length;
        }
      }

      const priceMsg = overridePrice !== null
        ? `，價格設為 $${overridePrice}（新建 ${inserts.length} + 覆寫 ${priceUpdatedCount}）`
        : "";
      toast.success(
        `${isClose ? "已關閉" : "已開啟"}！新增 ${inserts.length} 筆${overwriteMode !== "skip" ? `、覆寫 ${updates.length} 筆` : ""}${priceMsg}`
      );
      onComplete();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(`執行失敗：${e?.message || "未知錯誤"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>一鍵{operationMode === "close" ? "關閉" : "開啟"}庫存</DialogTitle>
          <DialogDescription>
            {operationMode === "close"
              ? "選擇多個房型與日期區間，批次關閉販售（可售數歸 0）。"
              : "選擇多個房型與日期區間，批次建立可售庫存。"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">

            <div className="space-y-5 py-2">
              {/* 操作模式 */}
              <div>
                <Label className="mb-1.5 block">操作模式</Label>
                <RadioGroup
                  value={operationMode}
                  onValueChange={(v) => setOperationMode(v as OperationMode)}
                  className="grid grid-cols-2 gap-2"
                >
                  <label
                    htmlFor="op-open"
                    className={cn(
                      "flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer",
                      operationMode === "open" && "border-primary bg-primary/5"
                    )}
                  >
                    <RadioGroupItem value="open" id="op-open" />
                    <span className="text-sm font-medium">開啟販售</span>
                  </label>
                  <label
                    htmlFor="op-close"
                    className={cn(
                      "flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer",
                      operationMode === "close" && "border-destructive bg-destructive/5"
                    )}
                  >
                    <RadioGroupItem value="close" id="op-close" />
                    <span className="text-sm font-medium">關閉販售</span>
                  </label>
                </RadioGroup>
              </div>

              {/* 日期區間 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5 block">起始日</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start font-normal", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "yyyy-MM-dd") : "選擇日期"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); if (d && endDate && endDate < d) setEndDate(undefined); }} defaultMonth={startDate} initialFocus className="pointer-events-auto p-3" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="mb-1.5 block">結束日</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start font-normal", !endDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "yyyy-MM-dd") : "選擇日期"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} defaultMonth={endDate ?? startDate} initialFocus className="pointer-events-auto p-3" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* 房型多選 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>選擇房型（{selectedRoomIds.size} / {roomTypes.length}）</Label>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={selectAll} type="button">全選</Button>
                    <Button variant="ghost" size="sm" onClick={clearAll} type="button">清除</Button>
                  </div>
                </div>
                <div className="border rounded-md p-3 max-h-60 overflow-y-auto space-y-2">
                  {roomTypes.map((rt) => (
                    <label
                      key={rt.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 px-2 py-1.5 rounded"
                    >
                      <Checkbox
                        checked={selectedRoomIds.has(rt.id)}
                        onCheckedChange={() => toggleRoom(rt.id)}
                      />
                      <span className="text-sm flex-1">{rt.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {rt.is_exclusive_package ? "包棟/包區" : "一般房型"} · 預設庫存 {rt.room_count ?? "-"}
                      </span>
                    </label>
                  ))}
                  {roomTypes.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-4">尚無房型資料</div>
                  )}
                </div>
              </div>

              {/* 庫存數值來源 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>庫存數值</Label>
                  {operationMode === "close" && (
                    <span className="text-xs text-muted-foreground">關閉模式下可售數固定為 0</span>
                  )}
                </div>
                <RadioGroup
                  value={valueMode}
                  onValueChange={(v) => setValueMode(v as ValueMode)}
                  disabled={operationMode === "close"}
                  className={cn(operationMode === "close" && "opacity-50 pointer-events-none")}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="default" id="vm-default" />
                    <Label htmlFor="vm-default" className="font-normal cursor-pointer">
                      使用房型預設庫存量（推薦）
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id="vm-custom" />
                    <Label htmlFor="vm-custom" className="font-normal cursor-pointer">手動輸入：</Label>
                    <Input
                      type="number"
                      min={0}
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      onFocus={() => setValueMode("custom")}
                      className="w-24 h-8"
                      disabled={operationMode === "close"}
                    />
                  </div>
                </RadioGroup>
              </div>

              {/* 價格設定 */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer mb-1.5">
                  <Checkbox
                    checked={changePrice}
                    onCheckedChange={(c) => setChangePrice(c === true)}
                  />
                  <span className="text-sm font-medium">同時設定價格</span>
                </label>
                {changePrice && (
                  <div className="ml-6 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">每晚價格 $</span>
                      <Input
                        type="number"
                        min={0}
                        value={priceValue}
                        onChange={(e) => setPriceValue(e.target.value)}
                        className="w-32 h-8"
                        placeholder="例如 3200"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      將寫入所選日期的基礎價格（pricing_template_id = null 的列）。若未勾選則新建列使用房型基礎價，已有設定的列保留原價。
                    </p>
                  </div>
                )}
              </div>

              {totalCells > 0 && (
                <Alert>
                  <AlertDescription className="text-sm">
                    預計處理 <strong>{selectedRoomIds.size}</strong> 個房型 × <strong>{dateList.length}</strong> 天 = <strong>{totalCells}</strong> 筆
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </ScrollArea>
        )}

        {step === 2 && (() => {
          const isClose = operationMode === "close";
          const selectedRooms = roomTypes.filter((r) => selectedRoomIds.has(r.id));
          const newValueLabel = isClose
            ? "可售數 = 0（關閉）"
            : valueMode === "custom"
              ? `可售數 = ${customValue}（手動）`
              : "可售數 = 各房型預設庫存";
          return (
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            <div className="space-y-4 py-2">
              <Alert>
                <AlertDescription className="text-sm space-y-1">
                  <div>共 <strong>{totalCells}</strong> 筆，其中：</div>
                  <div>• 新建（無資料的日期）：<strong className="text-primary">{insertCount}</strong> 筆</div>
                  <div>• 已有設定（將依下方策略處理）：<strong className="text-amber-600">{conflictCount}</strong> 筆</div>
                </AlertDescription>
              </Alert>

              {/* 新值預覽 */}
              <div className="border rounded-md p-3 bg-muted/30 space-y-1.5">
                <div className="text-sm font-medium">將寫入的新值</div>
                <div className="text-xs text-muted-foreground">
                  狀態：<strong>{isClose ? "關閉販售" : "開啟販售"}</strong>　·　{newValueLabel}
                </div>
                <div className="text-xs text-muted-foreground">
                  價格：{changePrice
                    ? <strong className="text-primary">${priceValue || 0} / 晚（將寫入所有選定日期）</strong>
                    : <span>沿用原設定或房型基礎價（不變動）</span>}
                </div>
                {!isClose && valueMode === "default" && (
                  <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                    {selectedRooms.map((r) => (
                      <div key={r.id}>
                        · {r.name}：預設庫存 <strong>{r.room_count ?? 1}</strong> 間　·　基礎價 <strong>${r.base_price ?? 0}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Label className="mb-2 block">已有設定的日期如何處理？</Label>
                <RadioGroup value={overwriteMode} onValueChange={(v) => setOverwriteMode(v as OverwriteMode)}>
                  <div className="flex items-start space-x-2 border rounded-md p-3">
                    <RadioGroupItem value="skip" id="om-skip" className="mt-0.5" />
                    <Label htmlFor="om-skip" className="font-normal cursor-pointer flex-1">
                      <div className="font-medium">只填補空白日，不覆寫</div>
                      <div className="text-xs text-muted-foreground mt-0.5">已設定的日期保留原值（安全）</div>
                    </Label>
                  </div>
                  <div className="flex items-start space-x-2 border rounded-md p-3">
                    <RadioGroupItem value="overwrite_status_only" id="om-status" className="mt-0.5" />
                    <Label htmlFor="om-status" className="font-normal cursor-pointer flex-1">
                      <div className="font-medium">只覆寫販售狀態，保留原可售數</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {isClose
                          ? "將日期改為關閉販售，但可售數保留原值"
                          : "將日期改為開啟販售，但可售數保留原值（不套用上方新值）"}
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-start space-x-2 border rounded-md p-3">
                    <RadioGroupItem value="overwrite" id="om-overwrite" className="mt-0.5" />
                    <Label htmlFor="om-overwrite" className="font-normal cursor-pointer flex-1">
                      <div className="font-medium">全部強制覆寫（含可售數）</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {isClose
                          ? "將所有日期都關閉販售並把可售數歸 0"
                          : `將所有日期都改為開啟販售，且${valueMode === "custom" ? `可售數改為 ${customValue}` : "可售數改為各房型預設庫存"}`}
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </div>
          );
        })()}

        <DialogFooter className="shrink-0">

          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
              <Button onClick={handleScan} disabled={scanning || totalCells === 0}>
                {scanning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                下一步：檢查衝突
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={submitting}>上一步</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                確認執行
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
