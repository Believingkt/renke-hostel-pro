import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
  DialogTrigger,
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
import { Calendar, Plus, Trash2, CalendarDays, Edit, Download, Filter, TrendingUp, LayoutGrid, List, Home, Loader2, Globe, Briefcase, RefreshCw } from "lucide-react";
import { format, getYear, startOfYear, endOfYear, isSameDay, addMonths, subMonths, addDays, differenceInCalendarDays } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { zhTW } from "date-fns/locale";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveTabs, TabItem } from "@/components/ResponsiveTabs";
import { PageHeader } from "@/components/PageHeader";

type HolidayType = 'holiday' | 'workday' | 'compensatory_day_off' | 'work_on_weekend';

interface PublicHoliday {
  id: string;
  holiday_date: string;
  holiday_name: string;
  holiday_type: HolidayType;
  is_custom?: boolean | null;
  created_at: string;
  updated_at?: string;
}

const HOLIDAY_TYPE_CONFIG: Record<HolidayType, { label: string; badge: 'default' | 'secondary'; description: string }> = {
  holiday: { label: '假日', badge: 'default', description: '國定假日（使用假日定價）' },
  compensatory_day_off: { label: '補假', badge: 'default', description: '國定假日補假（使用假日定價）' },
  work_on_weekend: { label: '補班', badge: 'secondary', description: '補班日（使用平日定價）' },
  workday: { label: '補班', badge: 'secondary', description: '補班日（使用平日定價）' },
};

// API holiday response type
interface ApiHoliday {
  date: string;
  name: string;
  type: HolidayType;
}

// 常見假日模板 (僅固定日期，避免誤導性農曆節日示例日期)
const COMMON_HOLIDAYS = [
  { name: "元旦", month: 1, day: 1 },
  { name: "和平紀念日", month: 2, day: 28 },
  { name: "兒童節", month: 4, day: 4 },
  { name: "清明節", month: 4, day: 5 },
  { name: "勞動節", month: 5, day: 1 },
  { name: "國慶日", month: 10, day: 10 },
];

const PublicHolidays = forwardRef(({ showInPricingPage = false }: { showInPricingPage?: boolean }, ref) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { currentAccommodationId: accommodationId, isLoading: subdomainLoading } = useAccommodation();
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isImportingFromApi, setIsImportingFromApi] = useState(false);
  const [apiHolidays, setApiHolidays] = useState<ApiHoliday[]>([]);
  const [selectedImportYear, setSelectedImportYear] = useState<number | null>(null);
  const [selectedHoliday, setSelectedHoliday] = useState<PublicHoliday | null>(null);
  const [newHoliday, setNewHoliday] = useState({
    name: "",
    date: undefined as Date | undefined,
    type: 'holiday' as HolidayType,
  });
  const [editHoliday, setEditHoliday] = useState({
    name: "",
    date: undefined as Date | undefined,
    type: 'holiday' as HolidayType,
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isEditDatePickerOpen, setIsEditDatePickerOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const currentYear = new Date().getFullYear();

  // 同步功能 state
  const [syncYear, setSyncYear] = useState<number>(new Date().getFullYear());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ inserted: number; year: number } | null>(null);

  // 同步總部（其他館別）假日設定
  const [sourceOptions, setSourceOptions] = useState<Array<{ id: string; name: string; count: number }>>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);

  // 新增模式：單日 / 區間
  const [addMode, setAddMode] = useState<"single" | "range">("single");
  const [rangeStart, setRangeStart] = useState<Date | undefined>(undefined);
  const [rangeEnd, setRangeEnd] = useState<Date | undefined>(undefined);
  const [isRangeStartPickerOpen, setIsRangeStartPickerOpen] = useState(false);
  const [isRangeEndPickerOpen, setIsRangeEndPickerOpen] = useState(false);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // 列表複選 / 批次刪除
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [accommodationName, setAccommodationName] = useState<string>("");

  const MAX_RANGE_DAYS = 366;

  const resetAddDialogState = () => {
    setNewHoliday({ name: "", date: undefined, type: 'holiday' });
    setRangeStart(undefined);
    setRangeEnd(undefined);
    setAddMode("single");
    setIsRangeStartPickerOpen(false);
    setIsRangeEndPickerOpen(false);
  };

  // Reset list immediately when switching accommodation to prevent cross-tenant flash
  useEffect(() => {
    setHolidays([]);
    setSelectedIds(new Set());
  }, [accommodationId]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedYear, viewMode]);

  useEffect(() => {
    if (subdomainLoading || !accommodationId) return;
    loadHolidays();
  }, [accommodationId, subdomainLoading]);

  useEffect(() => {
    if (!accommodationId) {
      setAccommodationName("");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("accommodation_info")
        .select("name")
        .eq("id", accommodationId)
        .maybeSingle();
      if (!cancelled) setAccommodationName((data as { name?: string } | null)?.name || "");
    })();
    return () => { cancelled = true; };
  }, [accommodationId]);

  const loadHolidays = async () => {
    if (!accommodationId) return;

    try {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("public_holidays")
        .select("id, holiday_date, holiday_name, holiday_type, is_custom, created_at, updated_at")
        .eq("accommodation_id", accommodationId)
        .order("holiday_date", { ascending: true });

      if (error) throw error;
      // Cast to handle string -> HolidayType
      const holidaysWithType = (data || []).map(h => ({
        ...h,
        holiday_type: (h.holiday_type as HolidayType) || 'holiday'
      }));
      setHolidays(holidaysWithType);
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Error loading holidays:", error);
      setError(error instanceof Error ? error.message : "載入假日資料失敗");
      toast({
        title: "載入失敗",
        description: "無法載入國定假日資料",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddHoliday = async () => {
    if (isSubmittingAdd) return;
    if (!accommodationId) return;

    if (!newHoliday.name.trim()) {
      toast({
        title: "請輸入假日名稱",
        variant: "destructive",
      });
      return;
    }

    if (addMode === "range") {
      await handleAddHolidayRange();
      return;
    }

    if (!newHoliday.date) {
      toast({
        title: "請選擇日期",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmittingAdd(true);
      const { error } = await supabase.from("public_holidays").insert({
        accommodation_id: accommodationId,
        holiday_name: newHoliday.name.trim(),
        holiday_date: format(newHoliday.date, "yyyy-MM-dd"),
        holiday_type: newHoliday.type,
        is_custom: true,
      });

      if (error) throw error;

      toast({
        title: "新增成功",
        description: "國定假日已新增",
      });

      setIsAddDialogOpen(false);
      resetAddDialogState();
      loadHolidays();
    } catch (error) {
      console.error("Error adding holiday:", error);
      toast({
        title: "新增失敗",
        description: "無法新增國定假日",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // 區間新增（起訖皆含，一天一筆，已存在日期保留不覆蓋）
  const handleAddHolidayRange = async () => {
    if (!accommodationId) return;

    if (!rangeStart || !rangeEnd) {
      toast({ title: "請選擇開始與結束日期", variant: "destructive" });
      return;
    }

    const diff = differenceInCalendarDays(rangeEnd, rangeStart);
    if (diff < 0) {
      toast({ title: "開始日期不得晚於結束日期", variant: "destructive" });
      return;
    }
    const totalDays = diff + 1;
    if (totalDays > MAX_RANGE_DAYS) {
      toast({
        title: "區間過長",
        description: `一次最多新增 ${MAX_RANGE_DAYS} 天，目前選取 ${totalDays} 天，請縮小範圍`,
        variant: "destructive",
      });
      return;
    }

    const rows = Array.from({ length: totalDays }, (_, i) => ({
      accommodation_id: accommodationId,
      holiday_name: newHoliday.name.trim(),
      holiday_date: format(addDays(rangeStart, i), "yyyy-MM-dd"),
      holiday_type: newHoliday.type,
      is_custom: true,
    }));

    try {
      setIsSubmittingAdd(true);
      const { data, error } = await supabase
        .from("public_holidays")
        .upsert(rows, { onConflict: "accommodation_id,holiday_date", ignoreDuplicates: true })
        .select("id, holiday_date");

      if (error) throw error;

      const insertedCount = (data || []).length;
      const skippedCount = totalDays - insertedCount;

      toast({
        title: "區間新增完成",
        description: `已新增 ${insertedCount} 天，略過 ${skippedCount} 天已存在日期`,
      });

      setIsAddDialogOpen(false);
      resetAddDialogState();
      loadHolidays();
    } catch (error) {
      console.error("Error adding holiday range:", error);
      toast({
        title: "區間新增失敗",
        description: error instanceof Error ? error.message : "無法新增區間假日",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingAdd(false);
    }
  };


  const handleEditHoliday = async () => {
    if (!selectedHoliday) return;
    
    if (!editHoliday.name.trim()) {
      toast({
        title: "請輸入假日名稱",
        variant: "destructive",
      });
      return;
    }

    if (!editHoliday.date) {
      toast({
        title: "請選擇日期",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("public_holidays")
        .update({
          holiday_name: editHoliday.name.trim(),
          holiday_date: format(editHoliday.date, "yyyy-MM-dd"),
          holiday_type: editHoliday.type,
        })
        .eq("id", selectedHoliday.id);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "國定假日已更新",
      });

      setIsEditDialogOpen(false);
      setSelectedHoliday(null);
      setEditHoliday({ name: "", date: undefined, type: 'holiday' });
      loadHolidays();
    } catch (error) {
      console.error("Error updating holiday:", error);
      toast({
        title: "更新失敗",
        description: "無法更新國定假日",
        variant: "destructive",
      });
    }
  };

  const handleDeleteHoliday = async () => {
    if (!selectedHoliday) return;

    try {
      const { error } = await supabase
        .from("public_holidays")
        .delete()
        .eq("id", selectedHoliday.id);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "國定假日已刪除",
      });

      setIsDeleteDialogOpen(false);
      setSelectedHoliday(null);
      loadHolidays();
    } catch (error) {
      console.error("Error deleting holiday:", error);
      toast({
        title: "刪除失敗",
        description: "無法刪除國定假日",
        variant: "destructive",
      });
    }
  };

  // 暴露方法給父組件
  useImperativeHandle(ref, () => ({
    openAddDialog: () => setIsAddDialogOpen(true),
    openBatchDialog: () => setIsBatchDialogOpen(true),
  }));

  // 從政府API獲取國定假日
  const fetchHolidaysFromApi = async (year: number) => {
    setIsImportingFromApi(true);
    setSelectedImportYear(year);
    setApiHolidays([]);
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-taiwan-holidays', {
        body: { year }
      });

      if (error) throw error;

      if (data?.holidays && data.holidays.length > 0) {
        setApiHolidays(data.holidays);
        toast({
          title: "取得假日資料成功",
          description: `已從${data.source === 'government_api' ? '政府開放資料' : '內建資料'}取得 ${data.holidays.length} 個假日`,
        });
      } else {
        // Fallback to local data
        const fallbackHolidays = COMMON_HOLIDAYS.map(holiday => ({
          date: `${year}-${String(holiday.month).padStart(2, '0')}-${String(holiday.day).padStart(2, '0')}`,
          name: holiday.name,
          type: 'holiday' as const,
        }));
        setApiHolidays(fallbackHolidays);
        toast({
          title: "使用預設資料",
          description: "無法連接政府API，將使用預設假日資料",
        });
      }
    } catch (error) {
      console.error("Error fetching holidays from API:", error);
      // Fallback to local data on error
      const fallbackHolidays = COMMON_HOLIDAYS.map(holiday => ({
        date: `${year}-${String(holiday.month).padStart(2, '0')}-${String(holiday.day).padStart(2, '0')}`,
        name: holiday.name,
        type: 'holiday' as const,
      }));
      setApiHolidays(fallbackHolidays);
      toast({
        title: "使用預設資料",
        description: "API連線失敗，將使用預設假日資料",
      });
    } finally {
      setIsImportingFromApi(false);
    }
  };

  // 確認導入已獲取的假日（含重複檢查）
  const confirmImportHolidays = async () => {
    if (!selectedImportYear || apiHolidays.length === 0) return;
    
    try {
      // 獲取現有假日的日期列表
      const existingDates = holidays.map(h => h.holiday_date);
      
      // 過濾掉已存在的日期
      const newHolidays = apiHolidays.filter(holiday => !existingDates.includes(holiday.date));
      const duplicateCount = apiHolidays.length - newHolidays.length;
      
      if (newHolidays.length === 0) {
        toast({
          title: "無需導入",
          description: `所有 ${apiHolidays.length} 個假日都已存在，無需重複導入`,
        });
        return;
      }
      
      const holidaysToImport = newHolidays.map(holiday => ({
        accommodation_id: accommodationId,
        holiday_name: holiday.name,
        holiday_date: holiday.date,
        holiday_type: holiday.type || 'holiday',
      }));

      const { error } = await supabase
        .from("public_holidays")
        .insert(holidaysToImport);

      if (error) throw error;

      const duplicateMessage = duplicateCount > 0 
        ? `（已跳過 ${duplicateCount} 個重複日期）` 
        : '';
      
      toast({
        title: "批量導入成功",
        description: `已成功導入 ${newHolidays.length} 個國定假日${duplicateMessage}`,
      });

      setIsBatchDialogOpen(false);
      setApiHolidays([]);
      setSelectedImportYear(null);
      loadHolidays();
    } catch (error) {
      console.error("Error batch importing holidays:", error);
      toast({
        title: "批量導入失敗",
        description: "發生錯誤，請稍後再試",
        variant: "destructive",
      });
    }
  };


  // 篩選後的假日列表
  const filteredHolidays = useMemo(() => {
    if (selectedYear === "all") return holidays;
    return holidays.filter(holiday => {
      const year = getYear(new Date(holiday.holiday_date));
      return year === parseInt(selectedYear);
    });
  }, [holidays, selectedYear]);

  // ===== 列表複選 =====
  const visibleIds = useMemo(() => filteredHolidays.map((h) => h.id), [filteredHolidays]);
  const selectedVisible = useMemo(
    () => filteredHolidays.filter((h) => selectedIds.has(h.id)),
    [filteredHolidays, selectedIds],
  );
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const someVisibleSelected = selectedVisible.length > 0 && !allVisibleSelected;

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds(() => (checked ? new Set(visibleIds) : new Set<string>()));
  };

  // 批次刪除摘要（僅目前可見且已勾選者）
  const batchDeleteSummary = useMemo(() => {
    const rows = selectedVisible;
    const dates = rows.map((r) => r.holiday_date).sort();
    const typeCounts: Record<string, number> = {};
    rows.forEach((r) => {
      const label = HOLIDAY_TYPE_CONFIG[r.holiday_type || 'holiday']?.label || r.holiday_type;
      typeCounts[label] = (typeCounts[label] || 0) + 1;
    });
    const govCount = rows.filter((r) => r.is_custom === false).length;
    const customCount = rows.filter((r) => r.is_custom === true).length;
    return {
      count: rows.length,
      minDate: dates[0],
      maxDate: dates[dates.length - 1],
      typeCounts,
      govCount,
      customCount,
    };
  }, [selectedVisible]);

  const handleBatchDelete = async () => {
    if (isDeleting) return;
    if (!accommodationId) return;
    const ids = selectedVisible.map((r) => r.id);
    if (ids.length === 0) return;

    try {
      setIsDeleting(true);
      const { data, error } = await supabase
        .from("public_holidays")
        .delete()
        .in("id", ids)
        .eq("accommodation_id", accommodationId)
        .select("id");

      if (error) throw error;

      const deleted = (data || []).length;
      toast({
        title: deleted === ids.length ? "批次刪除成功" : "批次刪除完成（部分資料已不存在）",
        description:
          deleted === ids.length
            ? `已刪除 ${deleted} 筆假日`
            : `選取 ${ids.length} 筆，實際刪除 ${deleted} 筆；其餘可能已被其他操作刪除`,
      });

      setIsBatchDeleteOpen(false);
      setSelectedIds(new Set());
      loadHolidays();
    } catch (error) {
      console.error("Error batch deleting holidays:", error);
      toast({
        title: "批次刪除失敗",
        description: error instanceof Error ? error.message : "無法刪除選取的假日",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };


  // 暴露方法給父組件
  useImperativeHandle(ref, () => ({
    openAddDialog: () => setIsAddDialogOpen(true),
    openBatchDialog: () => setIsBatchDialogOpen(true),
  }));

  // 統計資訊
  const stats = useMemo(() => {
    const holidayCount = holidays.filter(h => h.holiday_type !== 'workday').length;
    const workdayCount = holidays.filter(h => h.holiday_type === 'workday').length;
    
    const currentYearHolidays = holidays.filter(holiday => {
      const year = getYear(new Date(holiday.holiday_date));
      return year === currentYear;
    });
    
    const upcomingHolidays = holidays.filter(holiday => {
      const date = new Date(holiday.holiday_date);
      return date >= new Date();
    });

    return {
      total: holidays.length,
      holidays: holidayCount,
      workdays: workdayCount,
      currentYear: currentYearHolidays.length,
      upcoming: upcomingHolidays.length,
    };
  }, [holidays, currentYear]);

  // 獲取所有年份
  const availableYears = useMemo(() => {
    const years = new Set(holidays.map(h => getYear(new Date(h.holiday_date))));
    return Array.from(years).sort((a, b) => b - a);
  }, [holidays]);

  // 最後同步時間：取目前該民宿假日資料中最新的 updated_at / created_at
  const lastSyncAt = useMemo(() => {
    if (!holidays.length) return null;
    const ts = holidays
      .map((h) => new Date(h.updated_at || h.created_at).getTime())
      .filter((t) => !Number.isNaN(t));
    if (!ts.length) return null;
    return new Date(Math.max(...ts));
  }, [holidays]);

  // 重新同步指定年份的台灣國定假日
  const handleResyncYear = async () => {
    if (!accommodationId) return;
    setIsSyncing(true);
    setSyncMessage("正在從政府開放資料同步假日…");
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-taiwan-holidays", {
        body: { years: [syncYear] },
      });
      if (error) throw error;

      // 後端會回傳所有有權限的民宿同步結果，篩出當前民宿
      const results: Array<{ year: number; accommodation_id: string; inserted: number }> =
        data?.results ?? [];
      const mine = results.find(
        (r) => r.year === syncYear && r.accommodation_id === accommodationId,
      );
      const inserted = mine?.inserted ?? 0;

      setSyncResult({ inserted, year: syncYear });
      setSyncMessage(`完成：${syncYear} 年共寫入 ${inserted} 筆假日紀錄`);
      toast({
        title: "假日同步完成",
        description: `${syncYear} 年寫入 ${inserted} 筆`,
      });
      await loadHolidays();
    } catch (err) {
      console.error("Resync holidays error:", err);
      const msg = err instanceof Error ? err.message : "同步失敗";
      setSyncMessage(`同步失敗：${msg}`);
      toast({ title: "同步失敗", description: msg, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  // 載入可作為「總部範本」的來源館別（依已設定假日數排序）
  useEffect(() => {
    if (!accommodationId) return;
    let cancelled = false;
    (async () => {
      const [{ data: accs }, { data: rows }] = await Promise.all([
        supabase.from("accommodation_info").select("id, name").eq("is_active", true).order("display_order"),
        supabase.from("public_holidays").select("accommodation_id"),
      ]);
      if (cancelled) return;
      const counts = new Map<string, number>();
      (rows ?? []).forEach((r) => counts.set(r.accommodation_id, (counts.get(r.accommodation_id) ?? 0) + 1));
      const options = (accs ?? [])
        .filter((a) => a.id !== accommodationId)
        .map((a) => ({ id: a.id, name: a.name as string, count: counts.get(a.id) ?? 0 }))
        .filter((a) => a.count > 0)
        .sort((a, b) => b.count - a.count);
      setSourceOptions(options);
      setSourceId(options[0]?.id ?? "");
      setCopyMessage(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  // 從來源館別複製假日設定
  const handleCopyFromSource = async () => {
    if (!accommodationId || !sourceId) return;
    setIsCopying(true);
    setCopyOk(false);
    setCopyMessage("正在同步總部假日設定…");
    try {
      const { data: sourceRows, error: srcErr } = await supabase
        .from("public_holidays")
        .select("holiday_date, holiday_name, holiday_type, is_custom")
        .eq("accommodation_id", sourceId)
        .order("holiday_date");
      if (srcErr) throw srcErr;
      if (!sourceRows?.length) throw new Error("來源館別尚未設定任何假日");

      const existingDates = new Set(holidays.map((h) => h.holiday_date));
      const candidates = overwriteExisting
        ? sourceRows
        : sourceRows.filter((r) => !existingDates.has(r.holiday_date));

      if (!candidates.length) {
        setCopyOk(true);
        setCopyMessage("已是最新：沒有需要補上的假日日期");
        return;
      }

      const { error: upsertErr } = await supabase.from("public_holidays").upsert(
        candidates.map((r) => ({
          accommodation_id: accommodationId,
          holiday_date: r.holiday_date,
          holiday_name: r.holiday_name,
          holiday_type: r.holiday_type,
          is_custom: r.is_custom,
        })),
        { onConflict: "accommodation_id,holiday_date" },
      );
      if (upsertErr) throw upsertErr;

      setCopyOk(true);
      setCopyMessage(
        `同步完成：共寫入 ${candidates.length} 筆假日${overwriteExisting ? "（含覆蓋既有同日資料）" : "（僅補上缺漏日期）"}`,
      );
      toast({ title: "總部設定同步完成", description: `寫入 ${candidates.length} 筆` });
      await loadHolidays();
    } catch (err) {
      console.error("Copy holidays error:", err);
      const msg = err instanceof Error ? err.message : "同步失敗";
      setCopyOk(false);
      setCopyMessage(`同步失敗：${msg}`);
      toast({ title: "同步失敗", description: msg, variant: "destructive" });
    } finally {
      setIsCopying(false);
    }
  };


  // 獲取當前月份的假日
  const monthHolidays = useMemo(() => {
    return holidays.filter(holiday => {
      const holidayDate = new Date(holiday.holiday_date);
      return holidayDate.getMonth() === calendarMonth.getMonth() &&
             holidayDate.getFullYear() === calendarMonth.getFullYear();
    });
  }, [holidays, calendarMonth]);

  // 檢查某日期是否為假日
  const getHolidayForDate = (date: Date) => {
    return holidays.find(holiday => 
      isSameDay(new Date(holiday.holiday_date), date)
    );
  };

  // 處理日曆日期點擊
  const handleCalendarDayClick = (date: Date | undefined) => {
    if (!date) return;
    
    const existingHoliday = getHolidayForDate(date);
    if (existingHoliday) {
      // 如果已經是假日，打開編輯對話框
      setSelectedHoliday(existingHoliday);
      setEditHoliday({
        name: existingHoliday.holiday_name,
        date: new Date(existingHoliday.holiday_date),
        type: existingHoliday.holiday_type || 'holiday',
      });
      setIsEditDialogOpen(true);
    } else {
      // 如果不是假日，打開新增對話框並預設日期
      setNewHoliday({ name: "", date, type: 'holiday' });
      setIsAddDialogOpen(true);
    }
  };

  if (subdomainLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 md:space-y-8">
        <TableSkeleton rows={10} columns={4} showSearch={false} showFilters />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="無法載入假日資料"
        message={error}
        onRetry={loadHolidays}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 lg:space-y-8">
      {!showInPricingPage && (
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
              <BreadcrumbPage>國定假日</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      )}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="animate-fade-in hover-scale cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium">總假日數</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground animate-pulse" />
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {stats.total}
            </div>
            <p className="text-xs text-muted-foreground mt-1">所有已設定的假日</p>
          </CardContent>
        </Card>
        <Card className="animate-fade-in hover-scale cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/50" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium">{currentYear} 年假日</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground animate-pulse" style={{ animationDelay: '0.5s' }} />
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {stats.currentYear}
            </div>
            <p className="text-xs text-muted-foreground mt-1">今年度假日數量</p>
          </CardContent>
        </Card>
        <Card className="animate-fade-in hover-scale cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/50" style={{ animationDelay: '0.2s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium">即將到來</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground animate-pulse" style={{ animationDelay: '1s' }} />
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {stats.upcoming}
            </div>
            <p className="text-xs text-muted-foreground mt-1">尚未到來的假日</p>
          </CardContent>
        </Card>
      </div>

      {!showInPricingPage && (
        <PageHeader
          title="國定假日管理"
          icon={CalendarDays}
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setIsAddDialogOpen(true)} className="text-xs sm:text-sm">
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">新增假日</span>
                <span className="sm:hidden">新增</span>
              </Button>
            </div>
          }
        />
      )}

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              重新同步政府開放資料
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              選擇年份後重新從政府資料平台拉取假日（含補假與補班日）。同名日期會以新資料覆蓋。
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">同步年份</Label>
                <Select
                  value={String(syncYear)}
                  onValueChange={(v) => setSyncYear(parseInt(v, 10))}
                  disabled={isSyncing}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y} 年
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleResyncYear}
                disabled={isSyncing || !accommodationId}
                className="text-xs sm:text-sm"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    同步中…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    重新同步 {syncYear} 年
                  </>
                )}
              </Button>
              <div className="flex-1 text-xs sm:text-sm text-muted-foreground sm:text-right">
                {lastSyncAt ? (
                  <>
                    最後同步：{format(lastSyncAt, "yyyy-MM-dd HH:mm", { locale: zhTW })}
                  </>
                ) : (
                  <>尚未同步</>
                )}
              </div>
            </div>
            {syncMessage && (
              <div
                role="status"
                aria-live="polite"
                className={cn(
                  "mt-3 rounded-md border px-3 py-2 text-xs sm:text-sm",
                  isSyncing && "border-primary/30 bg-primary/5 text-primary",
                  !isSyncing && syncResult && "border-green-500/30 bg-green-500/5 text-green-700",
                  !isSyncing && !syncResult && "border-destructive/30 bg-destructive/5 text-destructive",
                )}
              >
                {syncMessage}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              同步總部假日設定
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              新館可直接沿用總部（其他館別）已維護好的國定假日與自訂假日。預設只補上本館缺漏的日期，不會動到已設定的日期。
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">來源館別</Label>
                <Select value={sourceId} onValueChange={setSourceId} disabled={isCopying || !sourceOptions.length}>
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <SelectValue placeholder="尚無可用的來源館別" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}（{o.count} 筆）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleCopyFromSource}
                disabled={isCopying || !sourceId || !accommodationId}
                className="text-xs sm:text-sm"
              >
                {isCopying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    同步中…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    同步總部設定
                  </>
                )}
              </Button>
              <label className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={overwriteExisting}
                  onChange={(e) => setOverwriteExisting(e.target.checked)}
                  disabled={isCopying}
                />
                覆蓋本館已存在的同一天設定
              </label>
            </div>
            {copyMessage && (
              <div
                role="status"
                aria-live="polite"
                className={cn(
                  "mt-3 rounded-md border px-3 py-2 text-xs sm:text-sm",
                  isCopying && "border-primary/30 bg-primary/5 text-primary",
                  !isCopying && copyOk && "border-green-500/30 bg-green-500/5 text-green-700",
                  !isCopying && !copyOk && "border-destructive/30 bg-destructive/5 text-destructive",
                )}
              >
                {copyMessage}
              </div>
            )}
          </CardContent>
        </Card>


      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardDescription className="text-xs sm:text-sm">
            管理假日定價的國定假日日期（假日定價包含：星期六 + 國定假日）。
            <span className="text-muted-foreground ml-1">
              共 {stats.holidays} 個假日、{stats.workdays} 個補班日
            </span>
          </CardDescription>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mt-3 sm:mt-4">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "list" | "calendar")} className="w-auto">
              <ResponsiveTabs
                tabs={[
                  { value: "list", label: "列表", icon: List },
                  { value: "calendar", label: "月曆", icon: LayoutGrid },
                ]}
                value={viewMode}
                onValueChange={(v) => setViewMode(v as "list" | "calendar")}
                mobileBreakpoint="md"
                showGradient={false}
                selectHeight="sm"
                selectWidth="w-[140px]"
                mobileClassName="mb-0"
                desktopClassName="w-auto"
                className="w-auto"
              />
            </Tabs>
            {viewMode === "list" && (
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-full sm:w-[140px] h-8 sm:h-10 text-xs sm:text-sm">
                  <Filter className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <SelectValue placeholder="篩選年份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs sm:text-sm">所有年份</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year.toString()} className="text-xs sm:text-sm">
                      {year} 年
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {viewMode === "list" ? (
            // 列表檢視
            <>
              {holidays.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="尚未設定假日"
                    description="開始新增假日日期，系統將自動套用假日定價"
                    action={{
                      label: "新增第一個假日",
                      onClick: () => setIsAddDialogOpen(true)
                    }}
                  />
              ) : filteredHolidays.length === 0 ? (
                  <EmptyState
                    icon={Filter}
                    title="此年份沒有假日"
                    description="選擇的年份沒有設定任何假日資料"
                  />
              ) : (
            <>
            {/* 批次操作列 */}
            <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="selectAllHolidays"
                  checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleSelectAllVisible(v === true)}
                  aria-label="全選目前篩選結果"
                />
                <Label htmlFor="selectAllHolidays" className="text-xs sm:text-sm text-muted-foreground">
                  全選目前篩選結果（{visibleIds.length} 筆）
                </Label>
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground">已選 {selectedVisible.length} 筆</span>
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedVisible.length === 0 || isDeleting}
                onClick={() => setIsBatchDeleteOpen(true)}
                className="gap-1"
              >
                <Trash2 className="h-4 w-4" />
                批次刪除
              </Button>
            </div>
            {/* 桌面版表格 */}
            <div className="hidden md:block table-scroll-container overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                        onCheckedChange={(v) => toggleSelectAllVisible(v === true)}
                        aria-label="全選"
                      />
                    </TableHead>
                    <TableHead className="text-foreground text-sm">假日名稱</TableHead>
                    <TableHead className="text-foreground text-sm">類型</TableHead>
                    <TableHead className="text-foreground text-sm">日期</TableHead>
                    <TableHead className="text-foreground text-sm">星期</TableHead>
                    <TableHead className="text-foreground text-sm">年份</TableHead>
                    <TableHead className="text-center text-foreground text-sm">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHolidays.map((holiday) => {
                    const date = new Date(holiday.holiday_date);
                    const dayOfWeek = format(date, "EEEE", { locale: zhTW });
                    const year = getYear(date);
                    const isPast = date < new Date();
                    
                    return (
                      <TableRow key={holiday.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="w-10">
                          <Checkbox
                            checked={selectedIds.has(holiday.id)}
                            onCheckedChange={(v) => toggleSelectOne(holiday.id, v === true)}
                            aria-label={`選取 ${holiday.holiday_name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          <div className="flex items-center gap-2">
                            {holiday.holiday_name}
                            {isPast && (
                              <Badge variant="secondary" className="text-xs">
                                已過
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <Badge 
                            variant={HOLIDAY_TYPE_CONFIG[holiday.holiday_type || 'holiday'].badge}
                            className={cn(
                              "gap-1",
                              holiday.holiday_type === 'workday' && "bg-orange-100 text-orange-700 border-orange-200"
                            )}
                          >
                            {holiday.holiday_type === 'workday' ? (
                              <Briefcase className="h-3 w-3" />
                            ) : (
                              <CalendarDays className="h-3 w-3" />
                            )}
                            {HOLIDAY_TYPE_CONFIG[holiday.holiday_type || 'holiday'].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(date, "yyyy年MM月dd日", { locale: zhTW })}
                        </TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="outline">{dayOfWeek}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{year}</TableCell>
                        <TableCell className="text-center text-sm">
                          <div className="flex justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="group"
                              onClick={() => {
                                setSelectedHoliday(holiday);
                                setEditHoliday({
                                  name: holiday.holiday_name,
                                  date: new Date(holiday.holiday_date),
                                  type: holiday.holiday_type || 'holiday',
                                });
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4 text-black group-hover:text-white transition-colors" />
                            </Button>
                            <Button
                              variant="ghost-destructive"
                              size="sm"
                              onClick={() => {
                                setSelectedHoliday(holiday);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* 移動版卡片列表 */}
            <div className="md:hidden space-y-3">
              {filteredHolidays.map((holiday) => {
                const date = new Date(holiday.holiday_date);
                const dayOfWeek = format(date, "EEEE", { locale: zhTW });
                const year = getYear(date);
                const isPast = date < new Date();
                
                return (
                  <Card key={holiday.id} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <Checkbox
                          className="mt-1 flex-shrink-0"
                          checked={selectedIds.has(holiday.id)}
                          onCheckedChange={(v) => toggleSelectOne(holiday.id, v === true)}
                          aria-label={`選取 ${holiday.holiday_name}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-sm truncate">{holiday.holiday_name}</h4>
                            <Badge 
                              variant={HOLIDAY_TYPE_CONFIG[holiday.holiday_type || 'holiday'].badge}
                              className={cn(
                                "text-xs gap-1",
                                holiday.holiday_type === 'workday' && "bg-orange-100 text-orange-700 border-orange-200"
                              )}
                            >
                              {holiday.holiday_type === 'workday' ? (
                                <Briefcase className="h-3 w-3" />
                              ) : (
                                <CalendarDays className="h-3 w-3" />
                              )}
                              {HOLIDAY_TYPE_CONFIG[holiday.holiday_type || 'holiday'].label}
                            </Badge>
                            {isPast && (
                              <Badge variant="secondary" className="text-xs flex-shrink-0">
                                已過
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(date, "yyyy年MM月dd日", { locale: zhTW })}
                          </p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 group"
                            onClick={() => {
                              setSelectedHoliday(holiday);
                              setEditHoliday({
                                name: holiday.holiday_name,
                                date: new Date(holiday.holiday_date),
                                type: holiday.holiday_type || 'holiday',
                              });
                              setIsEditDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4 text-black group-hover:text-white transition-colors" />
                          </Button>
                          <Button
                            variant="ghost-destructive"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setSelectedHoliday(holiday);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="text-xs">{dayOfWeek}</Badge>
                        <span className="text-muted-foreground">{year} 年</span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            </>
              )}
            </>
          ) : (
            // 月曆檢視
            <div className="space-y-4 sm:space-y-6">
              {/* 月份導航 */}
              <div className="flex items-center justify-between gap-2 px-2 sm:px-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                  className="gap-1 sm:gap-2 h-8 sm:h-10 px-2 sm:px-4"
                >
                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">上個月</span>
                  <span className="sm:hidden text-xs">上月</span>
                </Button>
                <div className="text-center flex-1">
                  <h3 className="text-base sm:text-xl lg:text-2xl font-bold">
                    {format(calendarMonth, "yyyy年MM月", { locale: zhTW })}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
                    共 {monthHolidays.length} 個假日
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                  className="gap-1 sm:gap-2 h-8 sm:h-10 px-2 sm:px-4"
                >
                  <span className="hidden sm:inline">下個月</span>
                  <span className="sm:hidden text-xs">下月</span>
                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </div>

              {/* 本月假日列表 */}
              {monthHolidays.length > 0 && (
                <div className="bg-primary/5 rounded-lg p-3 sm:p-4 border border-primary/20">
                  <p className="text-xs sm:text-sm font-medium mb-2 sm:mb-3 flex items-center gap-2">
                    <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                    本月假日
                  </p>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {monthHolidays.map(holiday => (
                      <Badge 
                        key={holiday.id} 
                        variant="secondary" 
                        className="cursor-pointer hover:bg-secondary/80 transition-colors px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm"
                        onClick={() => {
                          setSelectedHoliday(holiday);
                          setEditHoliday({
                            name: holiday.holiday_name,
                            date: new Date(holiday.holiday_date),
                            type: holiday.holiday_type || 'holiday',
                          });
                          setIsEditDialogOpen(true);
                        }}
                      >
                        <CalendarDays className="h-3 w-3 mr-1" />
                        {holiday.holiday_name} ({format(new Date(holiday.holiday_date), "MM/dd")})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 月曆主體 */}
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="min-w-[320px] sm:min-w-[600px] max-w-4xl mx-auto px-4 sm:px-0">
                  <CalendarComponent
                    mode="single"
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    locale={zhTW}
                    className="rounded-lg border shadow-sm w-full text-xs sm:text-sm"
                    classNames={{
                      months: "w-full",
                      month: "w-full",
                      caption: "hidden", // 隱藏預設標題，我們自己做了
                      table: "w-full border-collapse",
                      head_row: "flex w-full",
                      head_cell: "text-muted-foreground rounded-md flex-1 font-semibold text-xs sm:text-sm h-8 sm:h-12 flex items-center justify-center bg-muted/50",
                      row: "flex w-full mt-0.5 sm:mt-1",
                      cell: "flex-1 relative p-0 text-center focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent",
                      day: "h-12 sm:h-16 lg:h-20 w-full p-1 sm:p-2 font-normal hover:bg-accent hover:text-accent-foreground rounded-md transition-colors cursor-pointer flex flex-col items-center justify-start gap-0.5 sm:gap-1 text-xs sm:text-sm",
                      day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                      day_today: "bg-accent text-accent-foreground font-bold ring-2 ring-primary ring-offset-2",
                      day_outside: "text-muted-foreground opacity-30",
                      day_disabled: "text-muted-foreground opacity-50",
                      day_hidden: "invisible",
                    }}
                    modifiers={{
                      holiday: (date) => !!getHolidayForDate(date),
                    }}
                    modifiersClassNames={{
                      holiday: "bg-primary/10 text-primary font-bold border-2 border-primary hover:bg-primary/20",
                    }}
                    onDayClick={handleCalendarDayClick}
                    components={{
                      DayContent: ({ date }) => {
                        const holiday = getHolidayForDate(date);
                        const isToday = isSameDay(date, new Date());
                        return (
                          <div className="w-full h-full flex flex-col items-center justify-start gap-1">
                            <span className={cn("text-lg", isToday && "font-bold")}>
                              {format(date, "d")}
                            </span>
                            {holiday && (
                              <div className="w-full px-1">
                                <div className="text-[10px] font-semibold truncate bg-primary/20 rounded px-1 py-0.5 leading-tight">
                                  {holiday.holiday_name}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                    }}
                  />
                </div>
              </div>

              {/* 說明文字 */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-muted/30 rounded-lg border">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded border-2 border-primary bg-primary/10" />
                    <span className="text-muted-foreground">國定假日</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded ring-2 ring-primary bg-accent" />
                    <span className="text-muted-foreground">今天</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Edit className="h-3.5 w-3.5" />
                  點擊日期可新增或編輯假日
                </p>
              </div>
            </div>
          )}
        </CardContent>
        </Card>

      {/* 新增假日對話框 */}
      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          if (isSubmittingAdd) return;
          setIsAddDialogOpen(open);
          if (!open) resetAddDialogState();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增國定假日</DialogTitle>
            <DialogDescription>
              新增假日日期後，該日期將使用假日定價
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>新增方式</Label>
              <Tabs value={addMode} onValueChange={(v) => setAddMode(v as "single" | "range")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="single">單日</TabsTrigger>
                  <TabsTrigger value="range">日期區間</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="space-y-2">
              <Label htmlFor="holidayName">假日名稱</Label>
              <Input
                id="holidayName"
                placeholder="例如：春節、中秋節"
                value={newHoliday.name}
                onChange={(e) =>
                  setNewHoliday({ ...newHoliday, name: e.target.value })
                }
              />
            </div>
            {addMode === "single" ? (
              <div className="space-y-2">
                <Label>假日日期</Label>
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !newHoliday.date && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {newHoliday.date ? (
                        format(newHoliday.date, "PPP", { locale: zhTW })
                      ) : (
                        <span>選擇日期</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={newHoliday.date}
                      defaultMonth={newHoliday.date}
                      onSelect={(date) => {
                        setNewHoliday({ ...newHoliday, date });
                        setIsDatePickerOpen(false);
                      }}
                      locale={zhTW}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>開始日期</Label>
                    <Popover open={isRangeStartPickerOpen} onOpenChange={setIsRangeStartPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-start text-left font-normal", !rangeStart && "text-muted-foreground")}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {rangeStart ? format(rangeStart, "yyyy/MM/dd", { locale: zhTW }) : <span>選擇開始日期</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={rangeStart}
                          defaultMonth={rangeStart}
                          onSelect={(date) => {
                            setRangeStart(date);
                            setIsRangeStartPickerOpen(false);
                          }}
                          locale={zhTW}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>結束日期</Label>
                    <Popover open={isRangeEndPickerOpen} onOpenChange={setIsRangeEndPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-start text-left font-normal", !rangeEnd && "text-muted-foreground")}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {rangeEnd ? format(rangeEnd, "yyyy/MM/dd", { locale: zhTW }) : <span>選擇結束日期</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={rangeEnd}
                          defaultMonth={rangeEnd ?? rangeStart}
                          onSelect={(date) => {
                            setRangeEnd(date);
                            setIsRangeEndPickerOpen(false);
                          }}
                          locale={zhTW}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                {rangeStart && rangeEnd && (
                  differenceInCalendarDays(rangeEnd, rangeStart) < 0 ? (
                    <p className="text-xs text-destructive">開始日期不得晚於結束日期</p>
                  ) : differenceInCalendarDays(rangeEnd, rangeStart) + 1 > MAX_RANGE_DAYS ? (
                    <p className="text-xs text-destructive">
                      一次最多新增 {MAX_RANGE_DAYS} 天，目前選取 {differenceInCalendarDays(rangeEnd, rangeStart) + 1} 天，請縮小範圍
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      將新增 {differenceInCalendarDays(rangeEnd, rangeStart) + 1} 天（起訖日皆包含）；已存在的日期會自動略過，不覆蓋原內容。
                    </p>
                  )
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>類型</Label>
              <Select
                value={newHoliday.type}
                onValueChange={(value: HolidayType) => setNewHoliday({ ...newHoliday, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="holiday">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success" />
                      <span>假日（使用假日定價）</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="workday">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-orange-500" />
                      <span>補班日（使用平日定價）</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={isSubmittingAdd}>
              取消
            </Button>
            <Button
              onClick={handleAddHoliday}
              disabled={
                isSubmittingAdd ||
                (addMode === "range" &&
                  (!rangeStart ||
                    !rangeEnd ||
                    differenceInCalendarDays(rangeEnd, rangeStart) < 0 ||
                    differenceInCalendarDays(rangeEnd, rangeStart) + 1 > MAX_RANGE_DAYS))
              }
            >
              {isSubmittingAdd ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  處理中…
                </>
              ) : (
                "新增"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批次刪除確認 */}
      <AlertDialog
        open={isBatchDeleteOpen}
        onOpenChange={(open) => {
          if (isDeleting) return;
          setIsBatchDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認批次刪除假日？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>館別：{accommodationName || "（目前館別）"}</div>
                <div>已選日期數：{batchDeleteSummary.count} 天</div>
                <div>
                  日期範圍：{batchDeleteSummary.minDate || "-"} ～ {batchDeleteSummary.maxDate || "-"}
                </div>
                <div>
                  類型統計：
                  {Object.entries(batchDeleteSummary.typeCounts)
                    .map(([label, n]) => `${label} ${n}`)
                    .join("、") || "-"}
                </div>
                <div>
                  政府同步資料（is_custom=false）：{batchDeleteSummary.govCount} 筆；自訂資料（is_custom=true）：
                  {batchDeleteSummary.customCount} 筆
                </div>
                {batchDeleteSummary.govCount > 0 && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">
                    選取內容包含政府同步日期；刪除後，未來重新同步政府開放資料時可能再次出現。
                  </div>
                )}
                <div>此操作無法復原。</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleBatchDelete();
              }}
              disabled={isDeleting || batchDeleteSummary.count === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "刪除中…" : `刪除 ${batchDeleteSummary.count} 筆`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* 編輯對話框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編輯國定假日</DialogTitle>
            <DialogDescription>
              更新假日資訊
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editHolidayName">假日名稱</Label>
              <Input
                id="editHolidayName"
                placeholder="例如：春節、中秋節"
                value={editHoliday.name}
                onChange={(e) =>
                  setEditHoliday({ ...editHoliday, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>假日日期</Label>
              <Popover open={isEditDatePickerOpen} onOpenChange={setIsEditDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !editHoliday.date && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {editHoliday.date ? (
                      format(editHoliday.date, "PPP", { locale: zhTW })
                    ) : (
                      <span>選擇日期</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={editHoliday.date}
                    defaultMonth={editHoliday.date}
                    onSelect={(date) => {
                      setEditHoliday({ ...editHoliday, date });
                      setIsEditDatePickerOpen(false);
                    }}
                    locale={zhTW}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>類型</Label>
              <Select
                value={editHoliday.type}
                onValueChange={(value: HolidayType) => setEditHoliday({ ...editHoliday, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="holiday">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success" />
                      <span>假日（使用假日定價）</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="workday">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-orange-500" />
                      <span>補班日（使用平日定價）</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleEditHoliday}>更新</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量導入對話框 */}
      <Dialog open={isBatchDialogOpen} onOpenChange={(open) => {
        setIsBatchDialogOpen(open);
        if (!open) {
          setApiHolidays([]);
          setSelectedImportYear(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              自動導入國定假日
            </DialogTitle>
            <DialogDescription>
              從政府開放資料平台自動取得台灣國定假日與補班日（包含正確的農曆節日日期）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Step 1: 選擇年份並獲取資料 */}
            <div className="space-y-3">
              <p className="text-sm font-medium">步驟 1：選擇年份取得假日資料</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(year => (
                  <Button
                    key={year}
                    variant={selectedImportYear === year ? "default" : "outline"}
                    className="h-auto py-3 flex flex-col items-center gap-1"
                    onClick={() => fetchHolidaysFromApi(year)}
                    disabled={isImportingFromApi}
                  >
                    {isImportingFromApi && selectedImportYear === year ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarDays className="h-4 w-4" />
                    )}
                    <span className="font-semibold">{year} 年</span>
                  </Button>
                ))}
              </div>
            </div>
            
            {/* Step 2: 顯示取得的假日列表 */}
            {apiHolidays.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-medium">步驟 2：確認假日列表</p>
                  <div className="flex gap-2">
                    <Badge variant="default" className="gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {apiHolidays.filter(h => h.type === 'holiday').length} 假日
                    </Badge>
                    <Badge variant="secondary" className="gap-1 bg-orange-100 text-orange-700 border-orange-200">
                      <Briefcase className="h-3 w-3" />
                      {apiHolidays.filter(h => h.type === 'workday').length} 補班
                    </Badge>
                  </div>
                </div>
                <div className="rounded-lg border p-4 bg-muted/50 max-h-64 overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {apiHolidays.map((holiday, index) => (
                      <div key={`${holiday.date}-${index}`} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            holiday.type === 'workday' ? "bg-orange-500" : "bg-success"
                          )} />
                          <span>{holiday.name}</span>
                          {holiday.type === 'workday' && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-orange-100 text-orange-700">
                              補班
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {format(new Date(holiday.date), "M/d (EEE)", { locale: zhTW })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  資料來源：政府資料開放平台 / 內建假日資料
                </p>
              </div>
            )}

          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsBatchDialogOpen(false)}>
              取消
            </Button>
            {apiHolidays.length > 0 && (
              <Button onClick={confirmImportHolidays} className="gap-2">
                <Download className="h-4 w-4" />
                確認導入 {selectedImportYear} 年假日
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除「{selectedHoliday?.holiday_name}」嗎？
              刪除後該日期將改用平日或星期六定價規則。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteHoliday}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

// 設置displayName以便在React DevTools中識別
PublicHolidays.displayName = 'PublicHolidays';

// 導出按鈕組件給外部使用
export const PublicHolidaysButtons = ({ 
  onAddClick, 
  onBatchClick 
}: { 
  onAddClick: () => void; 
  onBatchClick: () => void; 
}) => {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onAddClick} className="text-xs sm:text-sm h-8 sm:h-10">
        <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
        新增假日
      </Button>
    </div>
  );
};

export default PublicHolidays;
