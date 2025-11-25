import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
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
import { Calendar, Plus, Trash2, CalendarDays, Edit, Download, Filter, TrendingUp, LayoutGrid, List } from "lucide-react";
import { format, getYear, startOfYear, endOfYear, isSameDay, addMonths, subMonths } from "date-fns";
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

interface PublicHoliday {
  id: string;
  holiday_date: string;
  holiday_name: string;
  created_at: string;
}

// 常見假日模板
const COMMON_HOLIDAYS = [
  { name: "元旦", month: 1, day: 1 },
  { name: "農曆春節", month: 2, day: 1 }, // 示例日期
  { name: "和平紀念日", month: 2, day: 28 },
  { name: "兒童節", month: 4, day: 4 },
  { name: "清明節", month: 4, day: 5 },
  { name: "勞動節", month: 5, day: 1 },
  { name: "端午節", month: 6, day: 10 }, // 示例日期
  { name: "中秋節", month: 9, day: 29 }, // 示例日期
  { name: "國慶日", month: 10, day: 10 },
];

const PublicHolidays = forwardRef(({ showInPricingPage = false }: { showInPricingPage?: boolean }, ref) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { accommodationId, isLoading: subdomainLoading } = useSubdomain();
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<PublicHoliday | null>(null);
  const [newHoliday, setNewHoliday] = useState({
    name: "",
    date: undefined as Date | undefined,
  });
  const [editHoliday, setEditHoliday] = useState({
    name: "",
    date: undefined as Date | undefined,
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isEditDatePickerOpen, setIsEditDatePickerOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (subdomainLoading || !accommodationId) return;
    loadHolidays();
  }, [accommodationId, subdomainLoading]);

  const loadHolidays = async () => {
    if (!accommodationId) return;

    try {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("public_holidays")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .order("holiday_date", { ascending: true });

      if (error) throw error;
      setHolidays(data || []);
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
    if (!newHoliday.name.trim()) {
      toast({
        title: "請輸入假日名稱",
        variant: "destructive",
      });
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
      const { error } = await supabase.from("public_holidays").insert({
        accommodation_id: accommodationId,
        holiday_name: newHoliday.name.trim(),
        holiday_date: format(newHoliday.date, "yyyy-MM-dd"),
      });

      if (error) throw error;

      toast({
        title: "新增成功",
        description: "國定假日已新增",
      });

      setIsAddDialogOpen(false);
      setNewHoliday({ name: "", date: undefined });
      loadHolidays();
    } catch (error) {
      console.error("Error adding holiday:", error);
      toast({
        title: "新增失敗",
        description: "無法新增國定假日",
        variant: "destructive",
      });
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
        })
        .eq("id", selectedHoliday.id);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "國定假日已更新",
      });

      setIsEditDialogOpen(false);
      setSelectedHoliday(null);
      setEditHoliday({ name: "", date: undefined });
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

  const handleBatchImport = async (year: number) => {
    try {
      const holidaysToImport = COMMON_HOLIDAYS.map(holiday => ({
        accommodation_id: accommodationId,
        holiday_name: holiday.name,
        holiday_date: `${year}-${String(holiday.month).padStart(2, '0')}-${String(holiday.day).padStart(2, '0')}`,
      }));

      const { error } = await supabase
        .from("public_holidays")
        .insert(holidaysToImport);

      if (error) throw error;

      toast({
        title: "批量導入成功",
        description: `已成功導入 ${year} 年常見假日`,
      });

      setIsBatchDialogOpen(false);
      loadHolidays();
    } catch (error) {
      console.error("Error batch importing holidays:", error);
      toast({
        title: "批量導入失敗",
        description: "部分假日可能已存在或發生錯誤",
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

  // 暴露方法給父組件
  useImperativeHandle(ref, () => ({
    openAddDialog: () => setIsAddDialogOpen(true),
    openBatchDialog: () => setIsBatchDialogOpen(true),
  }));

  // 統計資訊
  const stats = useMemo(() => {
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
      currentYear: currentYearHolidays.length,
      upcoming: upcomingHolidays.length,
    };
  }, [holidays, currentYear]);

  // 獲取所有年份
  const availableYears = useMemo(() => {
    const years = new Set(holidays.map(h => getYear(new Date(h.holiday_date))));
    return Array.from(years).sort((a, b) => b - a);
  }, [holidays]);

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
      });
      setIsEditDialogOpen(true);
    } else {
      // 如果不是假日，打開新增對話框並預設日期
      setNewHoliday({ name: "", date });
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
    <div className="space-y-6 md:space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="animate-fade-in hover-scale cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總假日數</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {stats.total}
            </div>
            <p className="text-xs text-muted-foreground">所有已設定的假日</p>
          </CardContent>
        </Card>
        <Card className="animate-fade-in hover-scale cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/50" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{currentYear} 年假日</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground animate-pulse" style={{ animationDelay: '0.5s' }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {stats.currentYear}
            </div>
            <p className="text-xs text-muted-foreground">今年度假日數量</p>
          </CardContent>
        </Card>
        <Card className="animate-fade-in hover-scale cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/50" style={{ animationDelay: '0.2s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">即將到來</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground animate-pulse" style={{ animationDelay: '1s' }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {stats.upcoming}
            </div>
            <p className="text-xs text-muted-foreground">尚未到來的假日</p>
          </CardContent>
        </Card>
      </div>

      {!showInPricingPage && (
        <PageHeader
          title="國定假日管理"
          icon={CalendarDays}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setIsBatchDialogOpen(true)}>
                <Download className="h-4 w-4 mr-2" />
                批量導入
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    新增假日
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>新增國定假日</DialogTitle>
                    <DialogDescription>
                      新增假日日期後，該日期將使用假日定價
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
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
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={handleAddHoliday}>新增</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          }
        />
      )}

      {showInPricingPage && (
        <div className="flex flex-wrap gap-2 mb-6">
          <Button variant="outline" onClick={() => setIsBatchDialogOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            批量導入
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                新增假日
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新增國定假日</DialogTitle>
                <DialogDescription>
                  新增假日日期後，該日期將使用假日定價
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
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
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleAddHoliday}>新增</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

        <Card>
        <CardHeader>
          <CardDescription>
            管理假日定價的國定假日日期（假日定價包含：星期六 + 國定假日）
          </CardDescription>
          <div className="flex flex-wrap gap-2 mt-4">
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
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="篩選年份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有年份</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year} 年
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
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
            <div className="table-scroll-container overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold text-foreground text-sm">假日名稱</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm">日期</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm">星期</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm">年份</TableHead>
                    <TableHead className="text-right font-semibold text-foreground text-sm">操作</TableHead>
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
                          {format(date, "yyyy年MM月dd日", { locale: zhTW })}
                        </TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="outline">{dayOfWeek}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{year}</TableCell>
                        <TableCell className="text-right text-sm">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedHoliday(holiday);
                                setEditHoliday({
                                  name: holiday.holiday_name,
                                  date: new Date(holiday.holiday_date),
                                });
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4 text-primary" />
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
              )}
            </>
          ) : (
            // 月曆檢視
            <div className="space-y-6">
              {/* 月份導航 */}
              <div className="flex items-center justify-between px-4">
                <Button
                  variant="outline"
                  onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                  className="gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  上個月
                </Button>
                <div className="text-center">
                  <h3 className="text-2xl font-bold">
                    {format(calendarMonth, "yyyy年MM月", { locale: zhTW })}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    共 {monthHolidays.length} 個假日
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                  className="gap-2"
                >
                  下個月
                  <Calendar className="h-4 w-4" />
                </Button>
              </div>

              {/* 本月假日列表 */}
              {monthHolidays.length > 0 && (
                <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    本月假日
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {monthHolidays.map(holiday => (
                      <Badge 
                        key={holiday.id} 
                        variant="secondary" 
                        className="cursor-pointer hover:bg-secondary/80 transition-colors px-3 py-1.5 text-sm"
                        onClick={() => {
                          setSelectedHoliday(holiday);
                          setEditHoliday({
                            name: holiday.holiday_name,
                            date: new Date(holiday.holiday_date),
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
              <div className="overflow-x-auto">
                <div className="min-w-[600px] max-w-4xl mx-auto">
                  <CalendarComponent
                    mode="single"
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    locale={zhTW}
                    className="rounded-lg border-2 shadow-sm w-full"
                    classNames={{
                      months: "w-full",
                      month: "w-full",
                      caption: "hidden", // 隱藏預設標題，我們自己做了
                      table: "w-full border-collapse",
                      head_row: "flex w-full",
                      head_cell: "text-muted-foreground rounded-md flex-1 font-semibold text-sm h-12 flex items-center justify-center bg-muted/50",
                      row: "flex w-full mt-1",
                      cell: "flex-1 relative p-0 text-center focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent",
                      day: "h-20 w-full p-2 font-normal hover:bg-accent hover:text-accent-foreground rounded-md transition-colors cursor-pointer flex flex-col items-center justify-start gap-1",
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
      <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>批量導入常見假日</DialogTitle>
            <DialogDescription>
              選擇年份後，系統將自動導入該年度的常見國定假日
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[currentYear - 1, currentYear, currentYear + 1].map(year => (
                <Button
                  key={year}
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => handleBatchImport(year)}
                >
                  <CalendarDays className="h-5 w-5" />
                  <span className="font-semibold">{year} 年</span>
                  <span className="text-xs text-muted-foreground">
                    導入 {COMMON_HOLIDAYS.length} 個假日
                  </span>
                </Button>
              ))}
            </div>
            <div className="rounded-lg border p-4 bg-muted/50">
              <p className="text-sm font-medium mb-2">將導入以下假日：</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-muted-foreground">
                {COMMON_HOLIDAYS.map(holiday => (
                  <div key={holiday.name} className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {holiday.name}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                ⚠️ 注意：農曆假日的日期為示例日期，請在導入後手動調整為正確日期
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBatchDialogOpen(false)}>
              關閉
            </Button>
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
            <AlertDialogAction onClick={handleDeleteHoliday}>
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
      <Button variant="outline" onClick={onBatchClick}>
        <Download className="h-4 w-4 mr-2" />
        批量導入
      </Button>
      <Button onClick={onAddClick}>
        <Plus className="h-4 w-4 mr-2" />
        新增假日
      </Button>
    </div>
  );
};

export default PublicHolidays;
