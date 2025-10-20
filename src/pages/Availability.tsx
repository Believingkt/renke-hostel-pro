import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarIcon, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AvailableRoom {
  roomNumber: string;
  roomType: string;
  price: number;
  floor: string;
}

const Availability = () => {
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const { toast } = useToast();

  // 模擬房間數據
  const allRooms: AvailableRoom[] = [
    { roomNumber: "101", roomType: "標準雙人房", price: 2800, floor: "1F" },
    { roomNumber: "102", roomType: "標準雙人房", price: 2800, floor: "1F" },
    { roomNumber: "201", roomType: "豪華雙人房", price: 3500, floor: "2F" },
    { roomNumber: "202", roomType: "豪華雙人房", price: 3500, floor: "2F" },
    { roomNumber: "301", roomType: "家庭四人房", price: 4800, floor: "3F" },
    { roomNumber: "302", roomType: "景觀套房", price: 5200, floor: "3F" },
  ];

  const handleSearch = () => {
    if (!startDate || !endDate) {
      toast({
        title: "請選擇日期區間",
        description: "請選擇入住日期和退房日期",
        variant: "destructive",
      });
      return;
    }

    if (startDate >= endDate) {
      toast({
        title: "日期區間錯誤",
        description: "退房日期必須晚於入住日期",
        variant: "destructive",
      });
      return;
    }

    // 模擬查詢空房（實際應該從後端 API 獲取）
    const available = allRooms.filter(() => Math.random() > 0.3);
    setAvailableRooms(available);
    setHasSearched(true);

    toast({
      title: "查詢完成",
      description: `找到 ${available.length} 間可預訂房間`,
    });
  };

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">空房查詢</h1>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">入住日期</label>
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
                    {startDate ? (
                      format(startDate, "yyyy-MM-dd")
                    ) : (
                      <span>選擇入住日期</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">退房日期</label>
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
                    {endDate ? (
                      format(endDate, "yyyy-MM-dd")
                    ) : (
                      <span>選擇退房日期</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) =>
                      date < new Date() || (startDate ? date <= startDate : false)
                    }
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button onClick={handleSearch} className="gap-2 w-full md:w-auto">
              <Search className="h-4 w-4" />
              查詢空房
            </Button>
          </div>
        </CardContent>
      </Card>

      {hasSearched && (
        <Card>
          <CardContent className="pt-6">
            {availableRooms.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg mb-2">查無空房</p>
                <p className="text-sm">此日期區間內沒有可預訂的房間</p>
              </div>
            ) : (
              <>
                {/* Desktop table view */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>房號</TableHead>
                        <TableHead>房型</TableHead>
                        <TableHead>樓層</TableHead>
                        <TableHead>房價</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {availableRooms.map((room) => (
                        <TableRow key={room.roomNumber}>
                          <TableCell className="font-medium">
                            {room.roomNumber}
                          </TableCell>
                          <TableCell>{room.roomType}</TableCell>
                          <TableCell>{room.floor}</TableCell>
                          <TableCell>NT$ {room.price.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile card view */}
                <div className="md:hidden space-y-3">
                  {availableRooms.map((room) => (
                    <Card key={room.roomNumber}>
                      <CardContent className="pt-6">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs text-muted-foreground">房號</p>
                              <p className="font-medium text-lg">{room.roomNumber}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">房價</p>
                              <p className="font-medium text-lg text-primary">
                                NT$ {room.price.toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                            <div>
                              <p className="text-xs text-muted-foreground">房型</p>
                              <p className="text-sm">{room.roomType}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">樓層</p>
                              <p className="text-sm">{room.floor}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Availability;
