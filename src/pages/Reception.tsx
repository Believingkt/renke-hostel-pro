import { useState } from "react";
import { Bell, CreditCard, DollarSign, Search, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Footer from "@/components/Footer";

const Reception = () => {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="space-y-6">
      {/* 頂部標籤 */}
      <Tabs defaultValue="today" className="w-full">
        <TabsList>
          <TabsTrigger value="today">今日櫃檯</TabsTrigger>
          <TabsTrigger value="status">房況表</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-6">
          {/* 統計卡片區 */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* 今日櫃檯 */}
            <Card>
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
            <Card>
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
            <Card>
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
          <Card>
            <CardHeader>
              <CardTitle>今日櫃檯</CardTitle>
            </CardHeader>
            <CardContent>
              {/* 入住/退房標籤 */}
              <Tabs defaultValue="checkin" className="w-full">
                <div className="flex items-center justify-between mb-4">
                  <TabsList>
                    <TabsTrigger value="checkin">
                      入住 <span className="ml-1">🏠</span>
                    </TabsTrigger>
                    <TabsTrigger value="checkout">
                      退房 <span className="ml-1">🚪</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* 搜尋欄 */}
                  <div className="relative w-96">
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
                  <div className="overflow-x-auto">
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
                  <div className="overflow-x-auto">
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
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status">
          <Card>
            <CardContent className="py-12">
              <p className="text-center text-muted-foreground">房況表功能開發中...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Footer />
    </div>
  );
};

export default Reception;
