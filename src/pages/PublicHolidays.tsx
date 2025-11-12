import { useState, useEffect } from "react";
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
import { Calendar, Plus, Trash2, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface PublicHoliday {
  id: string;
  holiday_date: string;
  holiday_name: string;
  created_at: string;
}

const PublicHolidays = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { accommodationId, isLoading: subdomainLoading } = useSubdomain();
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<PublicHoliday | null>(null);
  const [newHoliday, setNewHoliday] = useState({
    name: "",
    date: undefined as Date | undefined,
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

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
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-6 w-6 text-primary" />
                國定假日管理
              </CardTitle>
              <CardDescription className="mt-2">
                管理假日定價的國定假日日期（假日定價包含：星期六 + 國定假日）
              </CardDescription>
            </div>
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
        </CardHeader>
        <CardContent>
          {holidays.length === 0 ? (
            <div className="text-center py-12">
              <CalendarDays className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">尚未設定國定假日</p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新增第一個假日
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>假日名稱</TableHead>
                  <TableHead>日期</TableHead>
                  <TableHead>星期</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.map((holiday) => {
                  const date = new Date(holiday.holiday_date);
                  const dayOfWeek = format(date, "EEEE", { locale: zhTW });
                  
                  return (
                    <TableRow key={holiday.id}>
                      <TableCell className="font-medium">
                        {holiday.holiday_name}
                      </TableCell>
                      <TableCell>
                        {format(date, "PPP", { locale: zhTW })}
                      </TableCell>
                      <TableCell>{dayOfWeek}</TableCell>
                      <TableCell className="text-right">
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
