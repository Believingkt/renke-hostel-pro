import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";


const Orders = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "list");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab === "list") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">訂單查詢</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsContent value="list">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* 篩選區域 */}
              <div className="grid grid-cols-12 gap-4">
                {/* 日期區間 */}
                <div className="col-span-6">
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
                <div className="col-span-2 flex items-end">
                  <Button className="w-full h-10 bg-orange-600 hover:bg-orange-700">
                    搜尋
                  </Button>
                </div>
              </div>

              {/* 搜尋欄 */}
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-10">
                  <Label className="text-sm mb-2 block">搜尋</Label>
                  <div className="relative">
                    <Input
                      className="h-10 pr-20"
                    />
                  </div>
                </div>
                <div className="col-span-2 flex items-end">
                  <Button className="w-full h-10 bg-orange-600 hover:bg-orange-700">
                    搜尋
                  </Button>
                </div>
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
                      <td colSpan={9} className="py-12 text-center text-muted-foreground">
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

      
    </div>
  );
};

export default Orders;
