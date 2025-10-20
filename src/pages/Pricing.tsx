import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Pricing = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">房價庫存設定</h1>
        <p className="text-muted-foreground mt-2">
          管理房型價格與庫存數量
        </p>
      </div>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="basic">基本價格</TabsTrigger>
          <TabsTrigger value="project">專案價格</TabsTrigger>
          <TabsTrigger value="inventory">庫存管理</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>基本價格設定</CardTitle>
              <CardDescription>
                設定各房型的基本房價
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">基本價格設定內容</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="project" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>專案價格設定</CardTitle>
              <CardDescription>
                設定特殊專案的優惠價格
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">專案價格設定內容</p>
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
