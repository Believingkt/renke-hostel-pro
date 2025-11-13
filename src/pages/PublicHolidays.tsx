import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
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

const PublicHolidays = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { accommodationId, isLoading: subdomainLoading } = useSubdomain();
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
      const { data, error } = await supabase
        .from("public_holidays")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .order("holiday_date", { ascending: true });

      if (error) throw error;
      setHolidays(data || []);
    } catch (error) {
      console.error("Error loading holidays:", error);
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

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl space-y-6">
      {/* 統計卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總假日數</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">所有已設定的假日</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{currentYear} 年假日</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.currentYear}</div>
            <p className="text-xs text-muted-foreground">今年度假日數量</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">即將到來</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.upcoming}</div>
            <p className="text-xs text-muted-foreground">尚未到來的假日</p>
          </CardContent>
        </Card>
      </div>

      {/* 主要內容卡片 */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-6 w-6 text-primary" />
                國定假日管理
              </CardTitle>
              <CardDescription className="mt-2">
                管理假日定價的國定假日日期（假日定價包含：星期六 + 國定假日）
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "list" | "calendar")} className="w-auto">
                <TabsList>
                  <TabsTrigger value="list" className="gap-2">
                    <List className="h-4 w-4" />
                    列表
                  </TabsTrigger>
                  <TabsTrigger value="calendar" className="gap-2">
                    <LayoutGrid className="h-4 w-4" />
                    月曆
                  </TabsTrigger>
                </TabsList>
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
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "list" ? (
            // 列表檢視
            <>
              {holidays.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
                    <CalendarDays className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">尚未設定國定假日</h3>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    開始新增假日日期，系統將自動套用假日定價
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button onClick={() => setIsAddDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      新增第一個假日
                    </Button>
                    <Button variant="outline" onClick={() => setIsBatchDialogOpen(true)}>
                      <Download className="h-4 w-4 mr-2" />
                      批量導入
                    </Button>
                  </div>
                </div>
              ) : filteredHolidays.length === 0 ? (
                <div className="text-center py-12">
                  <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">此年份沒有假日資料</p>
                </div>
              ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">假日名稱</TableHead>
                    <TableHead className="font-semibold">日期</TableHead>
                    <TableHead className="font-semibold">星期</TableHead>
                    <TableHead className="font-semibold">年份</TableHead>
                    <TableHead className="text-right font-semibold">操作</TableHead>
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
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {holiday.holiday_name}
                            {isPast && (
                              <Badge variant="secondary" className="text-xs">
                                已過
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {format(date, "yyyy年MM月dd日", { locale: zhTW })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{dayOfWeek}</Badge>
                        </TableCell>
                        <TableCell>{year}</TableCell>
                        <TableCell className="text-right">
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
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedHoliday(holiday);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
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
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                >
                  上個月
                </Button>
                <h3 className="text-lg font-semibold">
                  {format(calendarMonth, "yyyy年MM月", { locale: zhTW })}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                >
                  下個月
                </Button>
              </div>

              {monthHolidays.length > 0 && (
                <div className="flex flex-wrap gap-2 px-2">
                  <span className="text-sm text-muted-foreground">本月假日：</span>
                  {monthHolidays.map(holiday => (
                    <Badge key={holiday.id} variant="secondary" className="cursor-pointer" onClick={() => {
                      setSelectedHoliday(holiday);
                      setEditHoliday({
                        name: holiday.holiday_name,
                        date: new Date(holiday.holiday_date),
                      });
                      setIsEditDialogOpen(true);
                    }}>
                      {holiday.holiday_name} ({format(new Date(holiday.holiday_date), "MM/dd")})
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex justify-center">
                <CalendarComponent
                  mode="single"
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  locale={zhTW}
                  className="rounded-md border p-3 pointer-events-auto"
                  modifiers={{
                    holiday: (date) => !!getHolidayForDate(date),
                  }}
                  modifiersStyles={{
                    holiday: {
                      backgroundColor: 'hsl(var(--primary) / 0.1)',
                      color: 'hsl(var(--primary))',
                      fontWeight: 'bold',
                      border: '2px solid hsl(var(--primary))',
                    }
                  }}
                  onDayClick={handleCalendarDayClick}
                  components={{
                    DayContent: ({ date }) => {
                      const holiday = getHolidayForDate(date);
                      return (
                        <div className="relative w-full h-full flex flex-col items-center justify-center">
                          <span>{format(date, "d")}</span>
                          {holiday && (
                            <span className="absolute bottom-0 text-[8px] font-medium truncate max-w-full px-0.5">
                              {holiday.holiday_name}
                            </span>
                          )}
                        </div>
                      );
                    }
                  }}
                />
              </div>

              <div className="text-center text-sm text-muted-foreground px-2">
                <p>點擊日期可新增或編輯假日</p>
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
};

export default PublicHolidays;
