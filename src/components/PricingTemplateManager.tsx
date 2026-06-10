import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Trash2, Check, X, GripVertical, Copy, Calendar as CalendarIcon, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { TIANSONG_ACCOMMODATION_ID, isTianSong, getRoomOverrides, getExtraDates, getExcludedDates, type RoomOverride, type SeasonSegment } from "@/utils/pricingTemplateHelpers";
import { SeasonSegmentsEditor } from "@/components/SeasonSegmentsEditor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { z } from "zod";

interface PricingTemplate {
  id: string;
  template_name: string;
  description: string | null;
  price: number | null;
  weekday_price: number | null;
  peak_price: number | null;
  weekend_price: number | null;
  weekday_enabled?: boolean | null;
  peak_enabled?: boolean | null;
  weekend_enabled?: boolean | null;
  available_rooms: number;
  meal_plans: any[];
  is_default: boolean;
  display_order: number;
  room_type_id?: string | null;
  room_type_ids?: string[] | null;
  valid_from?: string | null;
  valid_until?: string | null;
  room_overrides?: RoomOverride[] | null;
  extra_dates?: string[] | null;
  excluded_dates?: string[] | null;
  season_segments?: SeasonSegment[] | null;
}

interface RoomType {
  id: string;
  name: string;
  room_count: number | null;
}

interface PricingTemplateManagerProps {
  accommodationId: string;
}

export interface PricingTemplateManagerRef {
  openAddDialog: () => void;
}

// 這些民宿的「對應房型」維持單選（不動）：森山寫照、哈庫納馬塔塔
const SINGLE_SELECT_ACCOMMODATIONS = new Set([
  "5f764d55-ae11-4631-80fe-2e611853deae", // 森山寫照
  "6b6ac0dc-602b-4dec-9167-7791ac412ba3", // 哈庫納馬塔塔
]);

const templateSchema = z.object({
  template_name: z.string().trim().min(1, "專案名稱不能為空").max(50, "專案名稱最多50字"),
  description: z.string().trim().max(200, "描述最多200字").optional(),
  weekday_price: z.number().int().min(0, "價格不能為負數").nullable(),
  peak_price: z.number().int().min(0, "價格不能為負數").nullable(),
  weekend_price: z.number().int().min(0, "價格不能為負數").nullable(),
  available_rooms: z.number().int().min(0, "庫存量不能為負數"),
}).refine((data) => {
  return data.weekday_price != null || data.peak_price != null || data.weekend_price != null;
}, {
  message: "請至少設定一項價格（平日 / 旺日 / 假日）",
  path: ["weekday_price"],
});

export const PricingTemplateManager = forwardRef<PricingTemplateManagerRef, PricingTemplateManagerProps>(function PricingTemplateManager({ accommodationId }, ref) {
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PricingTemplate | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<PricingTemplate | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const isSingleSelect = SINGLE_SELECT_ACCOMMODATIONS.has(accommodationId);
  const isTS = isTianSong(accommodationId);

  const [formData, setFormData] = useState({
    template_name: "",
    description: "",
    weekday_price: null as number | null,
    peak_price: null as number | null,
    weekend_price: null as number | null,
    weekday_enabled: true,
    peak_enabled: true,
    weekend_enabled: true,
    available_rooms: 1,
    room_type_id: "" as string,
    room_type_ids: [] as string[],
    valid_from: "" as string,
    valid_until: "" as string,
    extra_dates: [] as string[],
    excluded_dates: [] as string[],
    room_overrides: {} as Record<string, { weekday_price: number | null; peak_price: number | null; weekend_price: number | null; available_rooms: number; weekday_enabled: boolean; peak_enabled: boolean; weekend_enabled: boolean }>,
    extra_segments: [] as SeasonSegment[],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (accommodationId) {
      loadTemplates();
      loadRoomTypes();
    }
  }, [accommodationId]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('pricing_templates')
        .select('*')
        .eq('accommodation_id', accommodationId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const templatesData = (data || []).map(t => ({
        ...t,
        meal_plans: Array.isArray(t.meal_plans) ? t.meal_plans : [],
        room_overrides: Array.isArray((t as any).room_overrides) ? (t as any).room_overrides : [],
        season_segments: Array.isArray((t as any).season_segments) ? (t as any).season_segments : [],
      })) as unknown as PricingTemplate[];
      
      setTemplates(templatesData);
    } catch (error) {
      console.error('載入專案失敗:', error);
      toast.error('載入專案失敗');
    } finally {
      setLoading(false);
    }
  };

  const loadRoomTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('room_types')
        .select('id, name, room_count')
        .eq('accommodation_id', accommodationId)
        .order('display_order');

      if (error) throw error;
      setRoomTypes(data || []);
    } catch (error) {
      console.error('載入房型失敗:', error);
      toast.error('載入房型失敗');
    }
  };

  useImperativeHandle(ref, () => ({
    openAddDialog: () => handleAddNew(),
  }));

  const handleAddNew = () => {
    setEditingTemplate(null);
    setFormData({
      template_name: "",
      description: "",
      weekday_price: null,
      peak_price: null,
      weekend_price: null,
      weekday_enabled: true,
      peak_enabled: true,
      weekend_enabled: true,
      available_rooms: 1,
      room_type_id: "",
      room_type_ids: [],
      valid_from: "",
      valid_until: "",
      extra_dates: [],
      excluded_dates: [],
      room_overrides: {},
      extra_segments: [],
    });
    setErrors({});
    setShowForm(true);
  };

  const handleEdit = (template: PricingTemplate) => {
    setEditingTemplate(template);
    const existingIds = Array.isArray(template.room_type_ids) && template.room_type_ids.length > 0
      ? template.room_type_ids
      : (template.room_type_id ? [template.room_type_id] : []);

    // 處理 season_segments：第一段對應「主期間」（填入上方表單），其餘為額外區段
    const allSegs: SeasonSegment[] = Array.isArray((template as any).season_segments)
      ? (template as any).season_segments
      : [];
    const hasSegs = allSegs.length > 0;
    const primarySeg = hasSegs ? allSegs[0] : null;
    const extraSegs = hasSegs ? allSegs.slice(1) : [];

    // 主期間的房型 override：segments 模式取 primarySeg.room_overrides；否則取頂層
    const sourceOverrides: RoomOverride[] = primarySeg && Array.isArray(primarySeg.room_overrides)
      ? primarySeg.room_overrides
      : getRoomOverrides(template as any);

    const overridesMap: Record<string, { weekday_price: number | null; peak_price: number | null; weekend_price: number | null; available_rooms: number; weekday_enabled: boolean; peak_enabled: boolean; weekend_enabled: boolean }> = {};
    for (const o of sourceOverrides) {
      overridesMap[o.room_type_id] = {
        weekday_price: o.weekday_price ?? null,
        peak_price: o.peak_price ?? null,
        weekend_price: o.weekend_price ?? null,
        available_rooms: o.available_rooms ?? 1,
        weekday_enabled: o.weekday_enabled !== false,
        peak_enabled: o.peak_enabled !== false,
        weekend_enabled: o.weekend_enabled !== false,
      };
    }
    setFormData({
      template_name: template.template_name,
      description: template.description || "",
      weekday_price: primarySeg?.weekday_price ?? template.weekday_price ?? template.price ?? null,
      peak_price: primarySeg?.peak_price ?? template.peak_price ?? null,
      weekend_price: primarySeg?.weekend_price ?? template.weekend_price ?? null,
      weekday_enabled: (primarySeg?.weekday_enabled ?? template.weekday_enabled) !== false,
      peak_enabled: (primarySeg?.peak_enabled ?? template.peak_enabled) !== false,
      weekend_enabled: (primarySeg?.weekend_enabled ?? template.weekend_enabled) !== false,
      available_rooms: (template as any).available_rooms ?? 1,
      room_type_id: template.room_type_id || existingIds[0] || "",
      room_type_ids: existingIds,
      valid_from: primarySeg?.valid_from || template.valid_from || "",
      valid_until: primarySeg?.valid_until || template.valid_until || "",
      extra_dates: primarySeg ? (primarySeg.extra_dates || []) : (Array.isArray(template.extra_dates) ? template.extra_dates : []),
      excluded_dates: primarySeg ? (primarySeg.excluded_dates || []) : (Array.isArray(template.excluded_dates) ? template.excluded_dates : []),
      room_overrides: overridesMap,
      extra_segments: extraSegs,
    });
    setErrors({});
    setShowForm(true);
  };

  const validateForm = (): boolean => {
    if (isTS) {
      const newErrors: Record<string, string> = {};
      if (!formData.template_name.trim()) newErrors.template_name = "專案名稱不能為空";
      if (!formData.valid_from) newErrors.valid_from = "請選擇專案開始日期";
      if (!formData.valid_until) newErrors.valid_until = "請選擇專案結束日期";
      if (formData.valid_from && formData.valid_until && formData.valid_from > formData.valid_until) {
        newErrors.valid_until = "結束日期必須晚於開始日期";
      }
      if (formData.room_type_ids.length === 0) {
        newErrors.room_type_ids = "請至少選擇一個對應房型";
      } else {
        for (const id of formData.room_type_ids) {
          const ov = formData.room_overrides[id];
          const hasPrice =
            (ov?.weekday_price != null && ov.weekday_price > 0) ||
            (ov?.peak_price != null && ov.peak_price > 0) ||
            (ov?.weekend_price != null && ov.weekend_price > 0);
          if (!hasPrice) {
            newErrors[`override_${id}`] = "請至少設定一項價格";
          }
          if (ov && ov.available_rooms < 0) {
            newErrors[`override_${id}_inv`] = "庫存量不能為負數";
          }
        }
      }

      // 驗證額外期間區段
      const segs = formData.extra_segments;
      const ranges: Array<{ from: string; to: string; idx: number }> = [];
      if (formData.valid_from && formData.valid_until) {
        ranges.push({ from: formData.valid_from, to: formData.valid_until, idx: -1 });
      }
      segs.forEach((s, i) => {
        if (!s.valid_from || !s.valid_until) {
          newErrors[`seg_${i}_date`] = `額外區段 ${i + 1}：請填寫起訖日期`;
          return;
        }
        if (s.valid_from > s.valid_until) {
          newErrors[`seg_${i}_date`] = `額外區段 ${i + 1}：結束日期必須晚於開始日期`;
          return;
        }
        const hasAnyPrice = (s.room_overrides || []).some((o) =>
          (o.weekday_price != null && o.weekday_price > 0) ||
          (o.peak_price != null && o.peak_price > 0) ||
          (o.weekend_price != null && o.weekend_price > 0)
        );
        if (!hasAnyPrice) {
          newErrors[`seg_${i}_price`] = `額外區段 ${i + 1}：請至少為一個房型設定一項價格`;
        }
        ranges.push({ from: s.valid_from, to: s.valid_until, idx: i });
      });
      // 檢查日期重疊
      for (let i = 0; i < ranges.length; i++) {
        for (let j = i + 1; j < ranges.length; j++) {
          const a = ranges[i];
          const b = ranges[j];
          if (a.from <= b.to && b.from <= a.to) {
            const k = b.idx >= 0 ? `seg_${b.idx}_overlap` : `valid_from`;
            newErrors[k] = `日期區段重疊：${a.from}~${a.to} 與 ${b.from}~${b.to}`;
          }
        }
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }
    try {
      templateSchema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error('請修正表單錯誤後再試');
      return;
    }

    try {
      const finalIds = isSingleSelect
        ? (formData.room_type_id ? [formData.room_type_id] : [])
        : formData.room_type_ids;
      const primaryId = isSingleSelect
        ? (formData.room_type_id || null)
        : (finalIds[0] || null);

      // 天送：以 room_overrides 為主，頂層 price/inventory 取「第一個房型的設定」做向後兼容
      let topWeekday = formData.weekday_price;
      let topPeak = formData.peak_price;
      let topWeekend = formData.weekend_price;
      let topInv = formData.available_rooms;
      let overridesArray: RoomOverride[] = [];
      if (isTS) {
        overridesArray = finalIds.map((id) => {
          const ov = formData.room_overrides[id] || { weekday_price: null, peak_price: null, weekend_price: null, available_rooms: 1, weekday_enabled: true, peak_enabled: true, weekend_enabled: true };
          return {
            room_type_id: id,
            weekday_price: ov.weekday_price ?? null,
            peak_price: ov.peak_price ?? null,
            weekend_price: ov.weekend_price ?? null,
            available_rooms: ov.available_rooms ?? 1,
            weekday_enabled: ov.weekday_enabled !== false,
            peak_enabled: ov.peak_enabled !== false,
            weekend_enabled: ov.weekend_enabled !== false,
          };
        });
        const first = overridesArray[0];
        if (first) {
          topWeekday = first.weekday_price;
          topPeak = first.peak_price;
          topWeekend = first.weekend_price;
          topInv = first.available_rooms;
        }
      }

      // 建構 season_segments：當有額外區段時，把「主期間」設為 segment[0]，其餘附加
      const extraSegs = formData.extra_segments || [];
      let seasonSegments: SeasonSegment[] = [];
      let topValidFrom = formData.valid_from || null;
      let topValidUntil = formData.valid_until || null;
      if (extraSegs.length > 0 && formData.valid_from && formData.valid_until) {
        const primarySeg: SeasonSegment = {
          id: "primary",
          label: "主期間",
          valid_from: formData.valid_from,
          valid_until: formData.valid_until,
          weekday_price: topWeekday ?? null,
          peak_price: topPeak ?? null,
          weekend_price: topWeekend ?? null,
          weekday_enabled: formData.weekday_enabled,
          peak_enabled: formData.peak_enabled,
          weekend_enabled: formData.weekend_enabled,
          extra_dates: formData.extra_dates,
          excluded_dates: formData.excluded_dates,
          room_overrides: overridesArray,
        };
        const cleanedExtras: SeasonSegment[] = extraSegs.map((s, i) => ({
          id: s.id || `extra-${i}`,
          label: s.label || null,
          valid_from: s.valid_from,
          valid_until: s.valid_until,
          weekday_price: s.weekday_price ?? null,
          peak_price: s.peak_price ?? null,
          weekend_price: s.weekend_price ?? null,
          weekday_enabled: s.weekday_enabled !== false,
          peak_enabled: s.peak_enabled !== false,
          weekend_enabled: s.weekend_enabled !== false,
          extra_dates: Array.isArray(s.extra_dates) ? s.extra_dates : [],
          excluded_dates: Array.isArray(s.excluded_dates) ? s.excluded_dates : [],
          room_overrides: Array.isArray(s.room_overrides) ? s.room_overrides : [],
        }));
        seasonSegments = [primarySeg, ...cleanedExtras];
        // 頂層 valid_from / until 用 union（向後相容查詢）
        topValidFrom = seasonSegments.reduce((a, s) => a && a < s.valid_from ? a : s.valid_from, seasonSegments[0].valid_from);
        topValidUntil = seasonSegments.reduce((a, s) => a && a > s.valid_until ? a : s.valid_until, seasonSegments[0].valid_until);
      }

      const dataToSave: any = {
        template_name: formData.template_name,
        description: formData.description || null,
        weekday_price: topWeekday,
        peak_price: topPeak,
        weekend_price: topWeekend,
        weekday_enabled: formData.weekday_enabled,
        peak_enabled: formData.peak_enabled,
        weekend_enabled: formData.weekend_enabled,
        price: topWeekday ?? topPeak ?? topWeekend, // 向後兼容
        available_rooms: topInv,
        accommodation_id: accommodationId,
        room_type_id: primaryId,
        room_type_ids: finalIds,
        valid_from: topValidFrom,
        valid_until: topValidUntil,
        extra_dates: formData.extra_dates,
        excluded_dates: formData.excluded_dates,
        room_overrides: overridesArray,
        season_segments: seasonSegments,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from('pricing_templates')
          .update(dataToSave)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('專案已更新');
      } else {
        const { error } = await supabase
          .from('pricing_templates')
          .insert(dataToSave);

        if (error) throw error;
        toast.success('專案已創建');
      }

      setShowForm(false);
      setEditingTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error('儲存專案失敗:', error);
      toast.error('儲存專案失敗');
    }
  };

  const handleDelete = (template: PricingTemplate) => {
    setDeletingTemplate(template);
    setDeleteDialogOpen(true);
  };

  const handleCopy = async (template: PricingTemplate) => {
    try {
      const copyIds = Array.isArray(template.room_type_ids) && template.room_type_ids.length > 0
        ? template.room_type_ids
        : (template.room_type_id ? [template.room_type_id] : []);
      const dataToCopy: any = {
        template_name: `${template.template_name} (複製)`,
        description: template.description,
        weekday_price: template.weekday_price ?? template.price ?? null,
        peak_price: template.peak_price ?? null,
        weekend_price: template.weekend_price ?? null,
        weekday_enabled: template.weekday_enabled !== false,
        peak_enabled: template.peak_enabled !== false,
        weekend_enabled: template.weekend_enabled !== false,
        price: template.weekday_price ?? template.peak_price ?? template.weekend_price ?? template.price ?? null,
        available_rooms: (template as any).available_rooms ?? 1,
        accommodation_id: accommodationId,
        room_type_id: template.room_type_id || copyIds[0] || null,
        room_type_ids: copyIds,
        display_order: templates.length,
        valid_from: template.valid_from || null,
        valid_until: template.valid_until || null,
        extra_dates: Array.isArray(template.extra_dates) ? template.extra_dates : [],
        excluded_dates: Array.isArray(template.excluded_dates) ? template.excluded_dates : [],
        room_overrides: getRoomOverrides(template as any),
        season_segments: Array.isArray((template as any).season_segments) ? (template as any).season_segments : [],
      };

      const { error } = await supabase
        .from('pricing_templates')
        .insert(dataToCopy);

      if (error) throw error;
      toast.success('專案已複製');
      loadTemplates();
    } catch (error) {
      console.error('複製專案失敗:', error);
      toast.error('複製專案失敗');
    }
  };

  const confirmDelete = async () => {
    if (!deletingTemplate) return;

    try {
      // Clear foreign key references in order_rooms first
      await (supabase
        .from('order_rooms')
        .update({ template_id: null, template_name: null }) as any)
        .eq('template_id', deletingTemplate.id);

      // Also clear room_inventory_pricing references
      await (supabase
        .from('room_inventory_pricing') as any)
        .delete()
        .eq('template_id', deletingTemplate.id);

      const { error } = await supabase
        .from('pricing_templates')
        .delete()
        .eq('id', deletingTemplate.id);

      if (error) throw error;
      toast.success('專案已刪除');
      loadTemplates();
    } catch (error) {
      console.error('刪除專案失敗:', error);
      toast.error('刪除專案失敗');
    } finally {
      setDeleteDialogOpen(false);
      setDeletingTemplate(null);
    }
  };

  interface SortableTemplateCardProps {
    template: PricingTemplate;
    onEdit: (template: PricingTemplate) => void;
    onDelete: (template: PricingTemplate) => void;
    onCopy: (template: PricingTemplate) => void;
  }

  const SortableTemplateCard = ({ 
    template, 
    onEdit, 
    onDelete, 
    onCopy,
  }: SortableTemplateCardProps) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: template.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const weekdayPrice = template.weekday_price ?? template.price;
    const peakPrice = template.peak_price;
    const weekendPrice = template.weekend_price;
    const availRooms = (template as any).available_rooms ?? 1;

    return (
      <Card 
        ref={setNodeRef} 
        style={style} 
        className="group hover:shadow-md transition-all duration-200 border-border/60 hover:border-primary/30 overflow-hidden"
      >
        {/* 房型標籤 */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
          <button
            className="cursor-grab active:cursor-grabbing touch-none opacity-40 group-hover:opacity-70 transition-opacity shrink-0"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-muted/60 text-xs font-medium text-muted-foreground max-w-full truncate">
            {(() => {
              const ids = Array.isArray(template.room_type_ids) && template.room_type_ids.length > 0
                ? template.room_type_ids
                : (template.room_type_id ? [template.room_type_id] : []);
              if (ids.length === 0) return '所有房型';
              const names = ids
                .map(id => roomTypes.find(r => r.id === id)?.name || '未知房型');
              return names.join('、');
            })()}
          </div>
        </div>

        {/* 標題 */}
        <div className="px-4 pt-1 pb-3">
          <div className="flex items-start justify-between gap-3 ml-6">
            <h4 className="font-bold text-base leading-snug truncate" title={template.template_name}>
              {template.template_name}
            </h4>
          </div>
          {template.description && template.description !== template.template_name && (
            <p className="text-sm text-muted-foreground mt-1 ml-6 line-clamp-2 leading-relaxed">{template.description}</p>
          )}
        </div>

        {/* 期限 + 價格與庫存資訊 */}
        <div className="px-4 pb-3 ml-6 space-y-2">
          {(template.valid_from || template.valid_until) && (
            <div className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
              <CalendarIcon className="h-3 w-3" />
              <span>期限：{template.valid_from || '不限'} ~ {template.valid_until || '不限'}</span>
              {Array.isArray((template as any).season_segments) && (template as any).season_segments.length > 1 && (
                <span className="ml-1 px-1.5 py-px rounded bg-amber-200/70 text-[10px] font-semibold">
                  {(template as any).season_segments.length} 段
                </span>
              )}
            </div>
          )}
          {isTS && getRoomOverrides(template as any).length > 0 ? (
            <div className="space-y-1.5">
              {getRoomOverrides(template as any).map((ov) => {
                const name = roomTypes.find(r => r.id === ov.room_type_id)?.name || '未知房型';
                return (
                  <div key={ov.room_type_id} className="text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground">平日 <span className="text-primary font-semibold tabular-nums">{ov.weekday_price != null ? `$${ov.weekday_price.toLocaleString()}` : '—'}</span></span>
                    <span className="text-muted-foreground">旺日 <span className="text-primary font-semibold tabular-nums">{ov.peak_price != null ? `$${ov.peak_price.toLocaleString()}` : '—'}</span></span>
                    <span className="text-muted-foreground">假日 <span className="text-primary font-semibold tabular-nums">{ov.weekend_price != null ? `$${ov.weekend_price.toLocaleString()}` : '—'}</span></span>
                    <span className="text-muted-foreground">庫存 <span className="font-semibold tabular-nums">{ov.available_rooms}</span> 間</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">平日價格</span>
                <div className="font-semibold text-primary tabular-nums">
                  {weekdayPrice != null ? `NT$ ${weekdayPrice.toLocaleString()}` : '未設定'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">旺日價格</span>
                <div className="font-semibold text-primary tabular-nums">
                  {peakPrice != null ? `NT$ ${peakPrice.toLocaleString()}` : '未設定'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">假日價格</span>
                <div className="font-semibold text-primary tabular-nums">
                  {weekendPrice != null ? `NT$ ${weekendPrice.toLocaleString()}` : '未設定'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">庫存量</span>
                <div className="font-semibold tabular-nums">
                  {availRooms} 間
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 分隔線 */}
        <div className="border-t border-border/40" />
        
        <CardContent className="p-3">
          {/* 操作按鈕 */}
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onCopy(template)}
              className="h-9 w-9 touch-manipulation shrink-0"
              title="複製專案"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onEdit(template)}
              className="h-9 w-9 touch-manipulation shrink-0"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(template)}
              className="h-9 w-9 touch-manipulation shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
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
      const oldIndex = templates.findIndex((item) => item.id === active.id);
      const newIndex = templates.findIndex((item) => item.id === over.id);

      const newTemplates = arrayMove(templates, oldIndex, newIndex);
      
      const updatedTemplates = newTemplates.map((template, index) => ({
        ...template,
        display_order: index
      }));
      
      setTemplates(updatedTemplates);

      try {
        const updates = updatedTemplates.map((template) => 
          supabase
            .from('pricing_templates')
            .update({ display_order: template.display_order })
            .eq('id', template.id)
        );

        await Promise.all(updates);
        toast.success("專案順序已更新");
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error updating template order:', error);
        }
        toast.error("無法更新專案順序");
        loadTemplates();
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (showForm) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{editingTemplate ? '編輯' : '新增'}專案</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template_name">專案名稱 *</Label>
            <Input
              id="template_name"
              value={formData.template_name}
              onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
              placeholder="例如：暑假旺季、春節連假"
              className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
            />
            {errors.template_name && (
              <p className="text-sm text-destructive">{errors.template_name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="描述此專案的用途"
              rows={2}
              className="min-h-[48px] text-base sm:text-sm touch-manipulation"
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          {/* 天送：專案期限 */}
          {isTS && (
            <div className="space-y-2">
              <Label>專案期限 *<span className="text-xs text-muted-foreground font-normal ml-1">（硬性限制：超出期限將無法選用此專案）</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-normal text-muted-foreground">開始日期</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full h-12 sm:h-10 justify-start text-left font-normal", !formData.valid_from && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.valid_from ? formData.valid_from : "選擇開始日期"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.valid_from ? parseISO(formData.valid_from) : undefined}
                        onSelect={(d) => setFormData({ ...formData, valid_from: d ? format(d, "yyyy-MM-dd") : "" })}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.valid_from && <p className="text-sm text-destructive">{errors.valid_from}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-normal text-muted-foreground">結束日期</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full h-12 sm:h-10 justify-start text-left font-normal", !formData.valid_until && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.valid_until ? formData.valid_until : "選擇結束日期"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.valid_until ? parseISO(formData.valid_until) : undefined}
                        onSelect={(d) => setFormData({ ...formData, valid_until: d ? format(d, "yyyy-MM-dd") : "" })}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.valid_until && <p className="text-sm text-destructive">{errors.valid_until}</p>}
                </div>
              </div>

              {/* 額外日期 / 排除日期 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">額外日期</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8">
                          <Plus className="h-4 w-4 mr-1" />新增
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          onSelect={(d) => {
                            if (!d) return;
                            const s = format(d, "yyyy-MM-dd");
                            if (formData.extra_dates.includes(s)) return;
                            setFormData({
                              ...formData,
                              extra_dates: [...formData.extra_dates, s].sort(),
                              excluded_dates: formData.excluded_dates.filter(x => x !== s),
                            });
                          }}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <p className="text-xs text-muted-foreground">期限外的特殊日期也納入此專案</p>
                  <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                    {formData.extra_dates.length === 0 ? (
                      <span className="text-xs text-muted-foreground">尚未新增</span>
                    ) : formData.extra_dates.map((d) => (
                      <Badge key={d} variant="secondary" className="gap-1">
                        {d}
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, extra_dates: formData.extra_dates.filter(x => x !== d) })}
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">排除日期</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8">
                          <Plus className="h-4 w-4 mr-1" />新增
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          onSelect={(d) => {
                            if (!d) return;
                            const s = format(d, "yyyy-MM-dd");
                            if (formData.excluded_dates.includes(s)) return;
                            setFormData({
                              ...formData,
                              excluded_dates: [...formData.excluded_dates, s].sort(),
                              extra_dates: formData.extra_dates.filter(x => x !== s),
                            });
                          }}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <p className="text-xs text-muted-foreground">期限內想剔除的特殊日期</p>
                  <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                    {formData.excluded_dates.length === 0 ? (
                      <span className="text-xs text-muted-foreground">尚未新增</span>
                    ) : formData.excluded_dates.map((d) => (
                      <Badge key={d} variant="secondary" className="gap-1">
                        {d}
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, excluded_dates: formData.excluded_dates.filter(x => x !== d) })}
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 平日 / 旺日 / 假日價格（擇一必填）— 天送由每房型獨立設定 */}
          {!isTS && (
            <div className="space-y-2">
              <Label>價格設定 <span className="text-xs text-muted-foreground font-normal">（擇一必填）</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="weekday_price" className="text-sm font-medium">平日價格</Label>
                    <Switch
                      checked={formData.weekday_enabled}
                      onCheckedChange={(v) => setFormData({ ...formData, weekday_enabled: !!v })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">週一 ~ 週四</p>
                  <Input
                    id="weekday_price"
                    type="number"
                    min="0"
                    value={formData.weekday_price ?? ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      weekday_price: e.target.value ? parseInt(e.target.value) : null
                    })}
                    placeholder="請輸入平日價格"
                    disabled={!formData.weekday_enabled}
                    className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                    inputMode="numeric"
                  />
                  {!formData.weekday_enabled && (
                    <p className="text-xs text-amber-700">已關閉：平日不會販售此專案</p>
                  )}
                </div>

                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="peak_price" className="text-sm font-medium">旺日價格</Label>
                    <Switch
                      checked={formData.peak_enabled}
                      onCheckedChange={(v) => setFormData({ ...formData, peak_enabled: !!v })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">週五、週日</p>
                  <Input
                    id="peak_price"
                    type="number"
                    min="0"
                    value={formData.peak_price ?? ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      peak_price: e.target.value ? parseInt(e.target.value) : null
                    })}
                    placeholder="請輸入旺日價格"
                    disabled={!formData.peak_enabled}
                    className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                    inputMode="numeric"
                  />
                  {!formData.peak_enabled && (
                    <p className="text-xs text-amber-700">已關閉：旺日不會販售此專案</p>
                  )}
                </div>

                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="weekend_price" className="text-sm font-medium">假日價格</Label>
                    <Switch
                      checked={formData.weekend_enabled}
                      onCheckedChange={(v) => setFormData({ ...formData, weekend_enabled: !!v })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">週六、國定假日</p>
                  <Input
                    id="weekend_price"
                    type="number"
                    min="0"
                    value={formData.weekend_price ?? ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      weekend_price: e.target.value ? parseInt(e.target.value) : null
                    })}
                    placeholder="請輸入假日價格"
                    disabled={!formData.weekend_enabled}
                    className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                    inputMode="numeric"
                  />
                  {!formData.weekend_enabled && (
                    <p className="text-xs text-amber-700">已關閉：假日不會販售此專案</p>
                  )}
                </div>
              </div>
              {(errors.weekday_price || errors.peak_price || errors.weekend_price) && (
                <p className="text-sm text-destructive">{errors.weekday_price || errors.peak_price || errors.weekend_price}</p>
              )}
            </div>
          )}

          {/* 庫存量 — 天送由每房型獨立設定 */}
          {!isTS && (
            <div className="space-y-2">
              <Label htmlFor="available_rooms">庫存量 *</Label>
              <Input
                id="available_rooms"
                type="number"
                min="0"
                value={formData.available_rooms}
                onChange={(e) => setFormData({
                  ...formData,
                  available_rooms: parseInt(e.target.value) || 0
                })}
                placeholder="請輸入庫存量"
                className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground">設定每天的可用房數</p>
              {errors.available_rooms && (
                <p className="text-sm text-destructive">{errors.available_rooms}</p>
              )}
            </div>
          )}

          {/* 對應房型 */}
          <div className="space-y-2">
            <Label htmlFor="room_type_id">對應房型 *{!isSingleSelect && <span className="text-xs text-muted-foreground font-normal ml-1">（可複選）</span>}</Label>
            {isSingleSelect ? (
              <>
                <Select value={formData.room_type_id || "none"} onValueChange={(v) => setFormData({ ...formData, room_type_id: v === "none" ? "" : v, room_type_ids: v === "none" ? [] : [v] })}>
                  <SelectTrigger className="h-12 sm:h-10">
                    <SelectValue placeholder="選擇對應房型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不指定房型</SelectItem>
                    {roomTypes.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">指定房型後，新增訂單時僅顯示該房型對應的專案</p>
              </>
            ) : (
              <>
                <div className="rounded-md border bg-background p-3 space-y-2 max-h-64 overflow-y-auto">
                  {roomTypes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">尚無房型可選</p>
                  ) : (
                    roomTypes.map((rt) => {
                      const checked = formData.room_type_ids.includes(rt.id);
                      return (
                        <label
                          key={rt.id}
                          className="flex items-center gap-2 cursor-pointer py-1"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = v === true
                                ? Array.from(new Set([...formData.room_type_ids, rt.id]))
                                : formData.room_type_ids.filter(id => id !== rt.id);
                              setFormData({
                                ...formData,
                                room_type_ids: next,
                                room_type_id: next[0] || "",
                              });
                            }}
                          />
                          <span className="text-sm">{rt.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  可同時指定多個房型；未勾選任何房型則代表「不指定房型（所有房型可用）」
                </p>
              </>
            )}
          </div>

          {/* 天送：每房型獨立價格與庫存 */}
          {isTS && formData.room_type_ids.length > 0 && (
            <div className="space-y-3">
              <Label>各房型獨立設定 *<span className="text-xs text-muted-foreground font-normal ml-1">（每個已選房型各自設定平日/旺日/假日價與庫存）</span></Label>
              {errors.room_type_ids && <p className="text-sm text-destructive">{errors.room_type_ids}</p>}
              <div className="space-y-3">
                {formData.room_type_ids.map((rtId) => {
                  const rt = roomTypes.find(r => r.id === rtId);
                  const ov = formData.room_overrides[rtId] || { weekday_price: null, peak_price: null, weekend_price: null, available_rooms: 1, weekday_enabled: true, peak_enabled: true, weekend_enabled: true };
                  const setOv = (patch: Partial<typeof ov>) => {
                    setFormData({
                      ...formData,
                      room_overrides: {
                        ...formData.room_overrides,
                        [rtId]: { ...ov, ...patch },
                      },
                    });
                  };
                  return (
                    <div key={rtId} className="rounded-lg border bg-card p-3 sm:p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">{rt?.name || '未知房型'}</h4>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs font-medium">平日價格</Label>
                            <Switch
                              checked={ov.weekday_enabled !== false}
                              onCheckedChange={(v) => setOv({ weekday_enabled: !!v })}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">週一 ~ 週四</p>
                          <Input
                            type="number"
                            min="0"
                            value={ov.weekday_price ?? ""}
                            onChange={(e) => setOv({ weekday_price: e.target.value ? parseInt(e.target.value) : null })}
                            placeholder="平日"
                            disabled={ov.weekday_enabled === false}
                            className="h-11 sm:h-9 text-base sm:text-sm"
                            inputMode="numeric"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs font-medium">旺日價格</Label>
                            <Switch
                              checked={ov.peak_enabled !== false}
                              onCheckedChange={(v) => setOv({ peak_enabled: !!v })}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">週五、週日</p>
                          <Input
                            type="number"
                            min="0"
                            value={ov.peak_price ?? ""}
                            onChange={(e) => setOv({ peak_price: e.target.value ? parseInt(e.target.value) : null })}
                            placeholder="旺日"
                            disabled={ov.peak_enabled === false}
                            className="h-11 sm:h-9 text-base sm:text-sm"
                            inputMode="numeric"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs font-medium">假日價格</Label>
                            <Switch
                              checked={ov.weekend_enabled !== false}
                              onCheckedChange={(v) => setOv({ weekend_enabled: !!v })}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">週六、國定假日</p>
                          <Input
                            type="number"
                            min="0"
                            value={ov.weekend_price ?? ""}
                            onChange={(e) => setOv({ weekend_price: e.target.value ? parseInt(e.target.value) : null })}
                            placeholder="假日"
                            disabled={ov.weekend_enabled === false}
                            className="h-11 sm:h-9 text-base sm:text-sm"
                            inputMode="numeric"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">庫存量</Label>
                          <p className="text-[10px] text-muted-foreground">&nbsp;</p>
                          <Input
                            type="number"
                            min="0"
                            value={ov.available_rooms}
                            onChange={(e) => setOv({ available_rooms: parseInt(e.target.value) || 0 })}
                            placeholder="庫存"
                            className="h-11 sm:h-9 text-base sm:text-sm"
                            inputMode="numeric"
                          />
                        </div>
                      </div>
                      {errors[`override_${rtId}`] && (
                        <p className="text-sm text-destructive">{errors[`override_${rtId}`]}</p>
                      )}
                      {errors[`override_${rtId}_inv`] && (
                        <p className="text-sm text-destructive">{errors[`override_${rtId}_inv`]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 額外期間區段：僅天送、且已選擇至少一個房型時開放 */}
          {isTS && formData.room_type_ids.length > 0 && (
            <div className="space-y-2">
              <SeasonSegmentsEditor
                segments={formData.extra_segments}
                onChange={(segs) => setFormData({ ...formData, extra_segments: segs })}
                roomTypes={roomTypes.map(r => ({ id: r.id, name: r.name }))}
                roomTypeIds={formData.room_type_ids}
              />
              {Object.keys(errors).filter(k => k.startsWith("seg_")).map(k => (
                <p key={k} className="text-sm text-destructive">{errors[k]}</p>
              ))}
            </div>
          )}





          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button onClick={handleSubmit} className="flex items-center justify-center gap-2 w-full sm:w-auto h-11 sm:h-10 touch-manipulation">
              <Check className="h-4 w-4" />
              {editingTemplate ? '更新' : '新增'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowForm(false);
                setEditingTemplate(null);
              }}
              className="flex items-center justify-center gap-2 w-full sm:w-auto h-11 sm:h-10 touch-manipulation"
            >
              <X className="h-4 w-4" />
              取消
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-4 animate-fade-in">
              <Skeleton className="h-16 sm:h-20 w-full rounded-lg" />
              <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 sm:h-28 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex items-center justify-center min-h-[200px] text-muted-foreground animate-fade-in">
              <div className="text-center space-y-2">
                <p className="text-base sm:text-lg font-medium">尚無專案</p>
                <p className="text-xs sm:text-sm">建立第一個專案，設定平日與假日價格</p>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={templates.map(t => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2 animate-fade-in">
                  {templates.map((template) => (
                    <SortableTemplateCard
                      key={template.id}
                      template={template}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onCopy={handleCopy}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除專案「{deletingTemplate?.template_name}」嗎？此操作無法復原。
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
    </>
  );
});
