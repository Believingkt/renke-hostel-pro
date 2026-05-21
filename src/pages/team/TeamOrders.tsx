import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OrderMetaDrawer } from "@/components/orders/OrderMetaDrawer";

const TEST_ORDER_ID = "e70a6a7f-7f3f-4f1f-bdb5-21fe23f5075b";

export default function TeamOrders() {
  const [testDrawerOpen, setTestDrawerOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">訂單補充資料</h1>
        <Button onClick={() => setTestDrawerOpen(true)}>測試 Drawer</Button>
      </div>
      <p className="text-muted-foreground">功能開發中</p>

      <OrderMetaDrawer
        orderId={TEST_ORDER_ID}
        open={testDrawerOpen}
        onClose={() => setTestDrawerOpen(false)}
      />
    </div>
  );
}
