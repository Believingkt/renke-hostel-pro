import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Calendar as CalendarIcon, Plus, Trash2, ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { SeasonSegment, RoomOverride } from "@/utils/pricingTemplateHelpers";

interface RoomTypeLite {
  id: string;
  name: string;
}

interface Props {
  segments: SeasonSegment[];
  onChange: (segments: SeasonSegment[]) => void;
  roomTypes: RoomTypeLite[];
  /** 已選擇的房型 ID 列表（決定每個 segment 要為哪幾間設定價格） */
  roomTypeIds: string[];
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyOverride(room_type_id: string): RoomOverride {
  return {
    room_type_id,
    weekday_price: null,
    peak_price: null,
    weekend_price: null,
    available_rooms: 1,
    weekday_enabled: true,
    peak_enabled: true,
    weekend_enabled: true,
  };
}

export function SeasonSegmentsEditor({ segments, onChange, roomTypes, roomTypeIds }: Props) {
  const [openValue, setOpenValue] = useState<string | undefined>(undefined);

  const addSegment = () => {
    const newSeg: SeasonSegment = {
      id: makeId(),
      label: "",
      valid_from: "",
      valid_until: "",
      weekday_enabled: true,
      peak_enabled: true,
      weekend_enabled: true,
      extra_dates: [],
      excluded_dates: [],
      room_overrides: roomTypeIds.map(emptyOverride),
    };
    const next = [...segments, newSeg];
    onChange(next);
    setOpenValue(newSeg.id);
  };

  const updateSeg = (idx: number, patch: Partial<SeasonSegment>) => {
    const next = segments.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(next);
  };

  const removeSeg = (idx: number) => {
    onChange(segments.filter((_, i) => i !== idx));
  };

  const updateRoomOverride = (segIdx: number, roomId: string, patch: Partial<RoomOverride>) => {
    const seg = segments[segIdx];
    const list = Array.isArray(seg.room_overrides) ? [...seg.room_overrides] : [];
    let found = list.findIndex((o) => o.room_type_id === roomId);
    if (found < 0) {
      list.push({ ...emptyOverride(roomId), ...patch });
    } else {
      list[found] = { ...list[found], ...patch };
    }
    updateSeg(segIdx, { room_overrides: list });
  };

  // 同步：roomTypeIds 變更時，為每個 segment 補齊缺少的 override
  // （非破壞性；新增的 room_type_id 自動補入空 override）
  const syncedSegments = segments.map((s) => {
    const existing = Array.isArray(s.room_overrides) ? s.room_overrides : [];
    const byId = new Map(existing.map((o) => [o.room_type_id, o]));
    const merged = roomTypeIds.map((id) => byId.get(id) || emptyOverride(id));
    return { ...s, room_overrides: merged };
  });

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-sm font-semibold">額外期間區段（不同月份不同價格）</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            例：6/9 月用上方主價格、7~8 月暑期想用不同價格 → 在這裡新增一段「7/1 ~ 8/31」並填入暑期價。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addSegment} className="h-9 shrink-0">
          <Plus className="h-4 w-4 mr-1" />新增區段
        </Button>
      </div>

      {syncedSegments.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">尚未新增任何額外區段。沒有額外區段時，整個專案期間都使用上方價格。</p>
      ) : (
        <Accordion type="single" collapsible value={openValue} onValueChange={setOpenValue} className="space-y-2">
          {syncedSegments.map((seg, idx) => {
            const value = seg.id || `seg-${idx}`;
            return (
              <AccordionItem key={value} value={value} className="border rounded-md bg-background">
                <div className="flex items-center pr-2">
                  <AccordionTrigger className="flex-1 px-3 py-2 hover:no-underline">
                    <div className="flex-1 flex items-center gap-2 text-left">
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">
                        {seg.label?.trim() || (seg.valid_from && seg.valid_until ? `${seg.valid_from} ~ ${seg.valid_until}` : `區段 ${idx + 1}（待設定）`)}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); removeSeg(idx); }}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="刪除此區段"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <AccordionContent className="px-3 pb-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1 space-y-1">
                      <Label className="text-xs">標籤（可選）</Label>
                      <Input
                        value={seg.label || ""}
                        onChange={(e) => updateSeg(idx, { label: e.target.value })}
                        placeholder="例：暑期"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">開始日期</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal text-sm", !seg.valid_from && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {seg.valid_from || "選擇"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={seg.valid_from ? parseISO(seg.valid_from) : undefined}
                            defaultMonth={seg.valid_from ? parseISO(seg.valid_from) : undefined}
                            onSelect={(d) => {
                              if (!d) { updateSeg(idx, { valid_from: "" }); return; }
                              const ds = format(d, "yyyy-MM-dd");
                              const patch: any = { valid_from: ds };
                              if (seg.valid_until && seg.valid_until < ds) patch.valid_until = ds;
                              updateSeg(idx, patch);
                            }}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">結束日期</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal text-sm", !seg.valid_until && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {seg.valid_until || "選擇"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={seg.valid_until ? parseISO(seg.valid_until) : undefined}
                            defaultMonth={seg.valid_until ? parseISO(seg.valid_until) : seg.valid_from ? parseISO(seg.valid_from) : undefined}
                            onSelect={(d) => updateSeg(idx, { valid_until: d ? format(d, "yyyy-MM-dd") : "" })}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {roomTypeIds.length === 0 ? (
                    <p className="text-xs text-muted-foreground">請先在上方勾選對應房型，再為各房型設定本區段價格。</p>
                  ) : (
                    <div className="space-y-2">
                      {roomTypeIds.map((rtId) => {
                        const rt = roomTypes.find((r) => r.id === rtId);
                        const ov = (seg.room_overrides || []).find((o) => o.room_type_id === rtId) || emptyOverride(rtId);
                        return (
                          <div key={rtId} className="rounded-md border p-2 space-y-2 bg-muted/20">
                            <div className="text-xs font-semibold">{rt?.name || "未知房型"}</div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {(["weekday", "peak", "weekend"] as const).map((tier) => {
                                const priceKey = `${tier}_price` as const;
                                const enKey = `${tier}_enabled` as const;
                                const label = tier === "weekday" ? "平日" : tier === "peak" ? "旺日" : "假日";
                                const hint = tier === "weekday" ? "週一~四" : tier === "peak" ? "週五、日" : "週六、國定";
                                const enabled = (ov as any)[enKey] !== false;
                                return (
                                  <div key={tier} className="space-y-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <Label className="text-[11px] font-medium">{label}</Label>
                                      <Switch
                                        checked={enabled}
                                        onCheckedChange={(v) => updateRoomOverride(idx, rtId, { [enKey]: !!v } as any)}
                                      />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">{hint}</p>
                                    <Input
                                      type="number"
                                      min="0"
                                      value={(ov as any)[priceKey] ?? ""}
                                      onChange={(e) => updateRoomOverride(idx, rtId, { [priceKey]: e.target.value ? parseInt(e.target.value) : null } as any)}
                                      placeholder={label}
                                      disabled={!enabled}
                                      className="h-9 text-sm"
                                      inputMode="numeric"
                                    />
                                  </div>
                                );
                              })}
                              <div className="space-y-1">
                                <Label className="text-[11px] font-medium">庫存量</Label>
                                <p className="text-[10px] text-muted-foreground">&nbsp;</p>
                                <Input
                                  type="number"
                                  min="0"
                                  value={ov.available_rooms ?? 1}
                                  onChange={(e) => updateRoomOverride(idx, rtId, { available_rooms: parseInt(e.target.value) || 0 })}
                                  className="h-9 text-sm"
                                  inputMode="numeric"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
