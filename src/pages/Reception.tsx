import { useState } from "react";
import { Bell, CreditCard, DollarSign, Search, ArrowRight, Filter, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Calendar } from "@/components/ui/calendar";
import Footer from "@/components/Footer";

const Reception = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>(["1棟"]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* 頂部標籤 */}
      <Tabs defaultValue="today" className="w-full">
        <TabsList>
          <TabsTrigger value="today">今日櫃檯</TabsTrigger>
          <TabsTrigger value="status">房況表</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4 md:space-y-6">
          {/* 統計卡片區 */}
          <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* 今日櫃檯 */}
            <Card className="shadow-card hover:shadow-card-hover transition-base">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-semibold">今日櫃檯</CardTitle>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                    <Bell className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">住房/退房為今日</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">今日住房</span>
                    <span className="text-2xl font-bold">0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">今日退房</span>
                    <span className="text-2xl font-bold">0</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 最新訂單 */}
            <Card className="shadow-card hover:shadow-card-hover transition-base">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-semibold">最新訂單</CardTitle>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <CreditCard className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">訂購日為今日</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">未排房</span>
                    <span className="text-2xl font-bold">0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">已排房</span>
                    <span className="text-2xl font-bold">0</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 訂單待付 */}
            <Card className="shadow-card hover:shadow-card-hover transition-base">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-semibold">訂單待付</CardTitle>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                    <DollarSign className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">所有未付訂與逾期的訂單</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">未付訂/待付款</span>
                    <span className="text-2xl font-bold">0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">訂金逾期</span>
                    <span className="text-2xl font-bold">0</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 今日櫃檯詳細資料 */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg md:text-xl">今日櫃檯</CardTitle>
            </CardHeader>
            <CardContent>
              {/* 入住/退房標籤 */}
              <Tabs defaultValue="checkin" className="w-full">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <TabsList>
                    <TabsTrigger value="checkin">
                      入住 <span className="ml-1">🏠</span>
                    </TabsTrigger>
                    <TabsTrigger value="checkout">
                      退房 <span className="ml-1">🚪</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* 搜尋欄 */}
                  <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <TabsContent value="checkin" className="space-y-4">
                  {/* 入住統計 */}
                  <div className="flex gap-4 mb-4">
                    <Badge variant="outline" className="text-base px-4 py-2">
                      今日入住 (0 / 0)
                    </Badge>
                    <Badge variant="outline" className="text-base px-4 py-2">
                      明日入住 (0)
                    </Badge>
                  </div>

                  {/* 表格 */}
                  <div className="overflow-x-auto scrollbar-thin -mx-2 md:mx-0">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            訂單編號 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            顧客 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            訂購人 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            房型
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            狀態 <span className="ml-1">▼</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-muted-foreground">
                            暫無資料
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                <TabsContent value="checkout" className="space-y-4">
                  {/* 退房統計 */}
                  <div className="flex gap-4 mb-4">
                    <Badge variant="outline" className="text-base px-4 py-2">
                      今日退房 (0 / 0)
                    </Badge>
                  </div>

                  {/* 表格 */}
                  <div className="overflow-x-auto scrollbar-thin -mx-2 md:mx-0">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            訂單編號 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            顧客 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            訂購人 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            房型
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            狀態 <span className="ml-1">▼</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-muted-foreground">
                            暫無資料
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status" className="space-y-4 md:space-y-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* 手機版篩選按鈕 */}
            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Filter className="h-4 w-4" />
                    篩選客房類別
                    <Badge variant="secondary" className="ml-auto">
                      {selectedRoomTypes.length + selectedStatus.length}
                    </Badge>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>篩選選項</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-4">
                    <Accordion type="multiple" defaultValue={["room-type", "area"]}>
                      <AccordionItem value="room-type">
                        <AccordionTrigger className="text-base font-medium">
                          客房類別
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pt-2">
                            {["1棟", "2棟", "3棟"].map((type) => (
                              <label
                                key={type}
                                className="flex items-center gap-2 cursor-pointer p-2 hover:bg-accent rounded-md transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedRoomTypes.includes(type)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRoomTypes([...selectedRoomTypes, type]);
                                    } else {
                                      setSelectedRoomTypes(
                                        selectedRoomTypes.filter((t) => t !== type)
                                      );
                                    }
                                  }}
                                  className="h-4 w-4"
                                />
                                <span className="text-sm">{type}</span>
                              </label>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="area">
                        <AccordionTrigger className="text-base font-medium">
                          包區
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pt-2">
                            <div className="p-2 text-sm text-muted-foreground">待排房</div>
                            <div className="p-2 text-sm">森山寫照</div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    <div className="pt-4 border-t">
                      <h3 className="text-sm font-medium mb-3">客房狀態</h3>
                      <div className="space-y-2">
                        {[
                          { id: "unassigned", label: "未排房", color: "bg-gray-100" },
                          { id: "checkedin", label: "尚未入住", color: "bg-blue-100" },
                          { id: "occupied", label: "入住", color: "bg-green-100" },
                          { id: "checkout", label: "退房", color: "bg-orange-100" },
                          { id: "pending", label: "尚未設定", color: "bg-purple-100" },
                          { id: "open", label: "開房", color: "bg-yellow-100" },
                          { id: "reserved", label: "包棟", color: "bg-pink-100" },
                        ].map((status) => (
                          <label
                            key={status.id}
                            className="flex items-center gap-2 cursor-pointer p-2 hover:bg-accent rounded-md transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedStatus.includes(status.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedStatus([...selectedStatus, status.id]);
                                } else {
                                  setSelectedStatus(
                                    selectedStatus.filter((s) => s !== status.id)
                                  );
                                }
                              }}
                              className="h-4 w-4"
                            />
                            <div className={`h-3 w-3 rounded ${status.color}`} />
                            <span className="text-sm">{status.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <h3 className="text-sm font-medium mb-3">付款狀態</h3>
                      <div className="space-y-2">
                        {[
                          { id: "overdue", label: "付訂逾期", icon: "⏰" },
                          { id: "paid", label: "已付訂金且尚有尾款/待結全額", icon: "💳" },
                          { id: "unpaid", label: "尚未付訂金", icon: "⏳" },
                          { id: "waiting", label: "等待付款中", icon: "💰" },
                          { id: "completed", label: "已結清", icon: "✅" },
                        ].map((payment) => (
                          <Button
                            key={payment.id}
                            variant="outline"
                            size="sm"
                            className="w-full justify-start text-left h-auto py-2 px-3"
                          >
                            <span className="mr-2">{payment.icon}</span>
                            <span className="text-xs">{payment.label}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* 桌面版左側篩選器 */}
            <div className="hidden lg:block lg:w-[240px] shrink-0">
              <Card className="shadow-card">
                <CardContent className="p-4 space-y-4">
                  <Accordion type="multiple" defaultValue={["room-type", "area"]}>
                    <AccordionItem value="room-type">
                      <AccordionTrigger className="text-base font-medium py-2">
                        客房類別
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          {["1棟", "2棟", "3棟"].map((type) => (
                            <label
                              key={type}
                              className="flex items-center gap-2 cursor-pointer p-2 hover:bg-accent rounded-md transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={selectedRoomTypes.includes(type)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRoomTypes([...selectedRoomTypes, type]);
                                  } else {
                                    setSelectedRoomTypes(
                                      selectedRoomTypes.filter((t) => t !== type)
                                    );
                                  }
                                }}
                                className="h-4 w-4"
                              />
                              <span className="text-sm">{type}</span>
                            </label>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="area">
                      <AccordionTrigger className="text-base font-medium py-2">
                        包區
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          <div className="p-2 text-sm text-muted-foreground">待排房</div>
                          <div className="p-2 text-sm">森山寫照</div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </div>

            {/* 右側主要內容 */}
            <div className="flex-1">
              <Card className="shadow-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg md:text-xl">2025/10</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* 日曆 */}
                  <div className="flex justify-center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      className="rounded-md border"
                    />
                  </div>

                  {/* 房間狀態示例 */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center justify-center w-8 h-8 border rounded">
                        🔒
                      </div>
                      <span className="font-medium">1棟</span>
                      <Badge variant="outline">無庫存</Badge>
                    </div>
                  </div>

                  {/* 客房狀態圖例 */}
                  <div>
                    <h3 className="text-sm font-medium mb-3">客房狀態：</h3>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "未排房", color: "bg-gray-100 border-dashed" },
                        { label: "尚未入住", color: "bg-blue-100" },
                        { label: "入住", color: "bg-green-100" },
                        { label: "退房", color: "bg-orange-100" },
                        { label: "尚未設定", color: "bg-purple-100" },
                        { label: "開房", color: "bg-yellow-100" },
                        { label: "包棟", color: "bg-pink-100" },
                      ].map((status) => (
                        <Badge
                          key={status.label}
                          variant="outline"
                          className={`${status.color} text-xs px-3 py-1`}
                        >
                          {status.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* 付款狀態 */}
                  <div>
                    <h3 className="text-sm font-medium mb-3">付款狀態：</h3>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "付訂逾期", icon: "⏰", color: "border-orange-300" },
                        {
                          label: "已付訂金且尚有尾款/待結全額",
                          icon: "💳",
                          color: "border-blue-300",
                        },
                        { label: "尚未付訂金", icon: "⏳", color: "border-gray-300" },
                        { label: "等待付款中", icon: "💰", color: "border-purple-300" },
                        { label: "已結清", icon: "✅", color: "border-green-300" },
                      ].map((payment) => (
                        <Badge
                          key={payment.label}
                          variant="outline"
                          className={`${payment.color} text-xs px-3 py-1`}
                        >
                          <span className="mr-1">{payment.icon}</span>
                          {payment.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Footer />
    </div>
  );
};

export default Reception;
