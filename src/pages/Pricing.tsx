import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Pricing = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "rooms");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && (tab === "rooms" || tab === "basic" || tab === "inventory")) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">房價庫存設定</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="rooms">房型管理</TabsTrigger>
          <TabsTrigger value="basic">價格管理</TabsTrigger>
          <TabsTrigger value="inventory">庫存管理</TabsTrigger>
        </TabsList>

        <TabsContent value="rooms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>房型管理</CardTitle>
              <CardDescription>
                管理住宿的各種房型資訊
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">房型管理內容</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>價格管理</CardTitle>
              <CardDescription>
                設定各房型的基本房價
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">價格管理內容</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>庫存管理</CardTitle>
              <CardDescription>
                管理各房型的可售庫存數量
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">庫存管理內容</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Pricing;
