import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";

export default function RoomInventory() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="房價庫存"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            房價庫存管理
          </CardTitle>
          <CardDescription>
            此功能開發中，敬請期待
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
            <div className="text-center space-y-2">
              <Package className="h-16 w-16 mx-auto opacity-20" />
              <p className="text-lg font-medium">房價庫存功能</p>
              <p className="text-sm">即將推出</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
