import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight, Calendar, Lock, Home, DoorOpen, DoorClosed, Settings, CheckCircle2, Clock, CreditCard, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Footer from "@/components/Footer";

const Orders = () => {
  const [date, setDate] = useState("2025/10/19");
  const [showNewOrders, setShowNewOrders] = useState(true);
  const [continuousDisplay, setContinuousDisplay] = useState(true);
  const [autoAssignRoom, setAutoAssignRoom] = useState(false);
  const [selectedDays, setSelectedDays] = useState(7);

  // 生成日曆日期（示例數據）
  const calendarDays = [
    { day: 19, dayOfWeek: "日", status: "無庫存" },
    { day: 20, dayOfWeek: "一", isToday: true, status: "無庫存" },
    { day: 21, dayOfWeek: "二", status: "無庫存" },
    { day: 22, dayOfWeek: "三", status: "無庫存" },
    { day: 23, dayOfWeek: "四", status: "無庫存" },
    { day: 24, dayOfWeek: "五", status: "無庫存" },
    { day: 25, dayOfWeek: "六", status: "無庫存" },
  ];

  return (
    <div className="space-y-6">
      {/* 頂部標籤 */}
      <Tabs defaultValue="info" className="w-full">
        <TabsList>
          <TabsTrigger value="info">📋 訂單資訊</TabsTrigger>
          <TabsTrigger value="list">訂單列表</TabsTrigger>
          <TabsTrigger value="reserved">保留單列表</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6">
          {/* 控制選項區 */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                {/* 左側開關 */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="new-orders"
                      checked={showNewOrders}
                      onCheckedChange={setShowNewOrders}
                    />
                    <Label htmlFor="new-orders">新增訂單</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="continuous"
                      checked={continuousDisplay}
                      onCheckedChange={setContinuousDisplay}
                    />
                    <Label htmlFor="continuous">連續顯示</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="auto-assign"
                      checked={autoAssignRoom}
                      onCheckedChange={setAutoAssignRoom}
                    />
                    <Label htmlFor="auto-assign">自動排房</Label>
                  </div>
                </div>

                {/* 右側新增按鈕 */}
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  新增訂單
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 日期選擇器 */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4 flex-wrap">
                <Button variant="outline" size="sm">
                  今日
                </Button>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-32"
                  />
                  <Button variant="ghost" size="icon">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={selectedDays === 3 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDays(3)}
                  >
                    3 天
                  </Button>
                  <Button
                    variant={selectedDays === 7 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDays(7)}
                  >
                    7 天
                  </Button>
                  <Button
                    variant={selectedDays === 15 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDays(15)}
                  >
                    15 天
                  </Button>
                  <Button
                    variant={selectedDays === 30 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedDays(30)}
                  >
                    30 天
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 日曆視圖 */}
          <div className="grid grid-cols-12 gap-6">
            {/* 左側篩選器 */}
            <div className="col-span-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <span>▼</span> 客房類別
                      </h3>
                      <div className="space-y-2 ml-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">▼ 包區</span>
                          <Badge variant="outline">1棟</Badge>
                        </div>
                        <div className="ml-4 space-y-2">
                          <div className="text-sm text-muted-foreground">待排房</div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">森山寫照</span>
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 右側日曆 */}
            <div className="col-span-9">
              <Card>
                <CardContent className="pt-6">
                  <div className="mb-4">
                    <h2 className="text-xl font-bold text-center">2025/10</h2>
                  </div>
                  
                  {/* 日曆表格 */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="border p-2 bg-muted/50"></th>
                          {calendarDays.map((day) => (
                            <th
                              key={day.day}
                              className={`border p-2 text-center ${
                                day.isToday
                                  ? "bg-blue-600 text-white"
                                  : day.dayOfWeek === "日"
                                  ? "text-red-500"
                                  : day.dayOfWeek === "六"
                                  ? "text-blue-500"
                                  : ""
                              }`}
                            >
                              <div className="text-sm">
                                {day.dayOfWeek} {day.day}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border p-2 font-medium">
                            <div className="flex items-center gap-2">
                              <Lock className="h-4 w-4" />
                              <span>1</span>
                            </div>
                          </td>
                          {calendarDays.map((day) => (
                            <td
                              key={day.day}
                              className={`border p-4 text-center ${
                                day.isToday ? "bg-blue-50" : "bg-gray-50"
                              }`}
                            >
                              <span className="text-sm text-muted-foreground">
                                {day.status}
                              </span>
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 圖例 */}
                  <div className="mt-6 space-y-3 text-sm">
                    <div>
                      <span className="font-semibold">客房狀態：</span>
                      <div className="flex flex-wrap gap-3 mt-2">
                        <Badge variant="outline" className="gap-1">
                          <span className="w-3 h-3 border-2 border-dashed border-gray-400 inline-block"></span>
                          未排房
                        </Badge>
                        <Badge variant="outline" className="gap-1 bg-green-50">
                          尚未入住
                        </Badge>
                        <Badge variant="outline" className="gap-1 bg-blue-50">
                          入住
                        </Badge>
                        <Badge variant="outline" className="gap-1 bg-orange-50">
                          退房
                        </Badge>
                        <Badge variant="outline" className="gap-1 bg-gray-50">
                          尚未設定
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <Lock className="h-3 w-3" />
                          開房
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          包棟
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold">付款狀態：</span>
                      <div className="flex flex-wrap gap-3 mt-2">
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3 text-orange-500" />
                          付訂逾期
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <CreditCard className="h-3 w-3 text-blue-500" />
                          已付訂金且尚有尾款/待結全額
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <AlertCircle className="h-3 w-3 text-gray-500" />
                          尚未付訂金
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <CreditCard className="h-3 w-3 text-purple-500" />
                          等待付款中
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          已結清
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* 篩選區域 */}
              <div className="grid grid-cols-12 gap-4">
                {/* 訂單來源 */}
                <div className="col-span-2">
                  <Label className="text-sm mb-2 block">訂單來源</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option>(訂單來源)</option>
                  </select>
                </div>

                {/* 日期區間 */}
                <div className="col-span-5">
                  <Label className="text-sm mb-2 block">日期區間</Label>
                  <div className="flex items-center gap-2">
                    <select className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option>入住日期</option>
                      <option>訂購日期</option>
                    </select>
                    <Button variant="ghost" size="icon" className="h-10 w-10">
                      <Calendar className="h-4 w-4" />
                    </Button>
                    <Input
                      type="text"
                      value="2025-10-20"
                      className="h-10"
                      readOnly
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="text"
                      value="2025-10-21"
                      className="h-10"
                      readOnly
                    />
                  </div>
                </div>

                {/* 付款狀態 */}
                <div className="col-span-2">
                  <Label className="text-sm mb-2 block">付款狀態</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option>(付款狀態)</option>
                  </select>
                </div>

                {/* 訂單狀態 */}
                <div className="col-span-2">
                  <Label className="text-sm mb-2 block">訂單狀態</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option>(訂單狀態)</option>
                  </select>
                </div>

                {/* 搜尋按鈕 */}
                <div className="col-span-1 flex items-end">
                  <Button className="w-full h-10 bg-blue-600 hover:bg-blue-700">
                    搜尋
                  </Button>
                </div>
              </div>

              {/* 搜尋欄 */}
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <Label className="text-sm mb-2 block">搜尋</Label>
                  <div className="relative">
                    <Input
                      className="h-10 pr-20"
                    />
                  </div>
                </div>
                <Button variant="outline" className="h-10">
                  搜尋
                </Button>
              </div>

              {/* 下載和預覽按鈕 */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="gap-2">
                  <span>⬇</span> 下載
                </Button>
                <Button variant="outline" className="gap-2">
                  <span>👁</span> 預覽
                </Button>
              </div>

              {/* 訂單表格 */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂單編號 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂購日期 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂購人 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        入住 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        退房 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂單來源 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        付款狀態
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        價格 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        已收 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂單備註
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-muted-foreground">
                        暫無資料
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reserved">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* 快速搜尋 */}
              <div className="flex justify-end">
                <Input
                  className="w-80"
                />
              </div>

              {/* 保留單表格 */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂單編號 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        保留期限 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂購日期 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂單來源 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂購人 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        聯絡電話 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂單備註 <span className="ml-1">↕</span>
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-muted-foreground">
                        暫無資料
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Footer />
    </div>
  );
};

export default Orders;
