import { useAccommodation } from "@/contexts/AccommodationContext";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import SalesServiceAnalyticsTab from "@/components/analytics/SalesServiceAnalyticsTab";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3 } from "lucide-react";

const Analytics = () => {
  const { currentAccommodationId: accommodationId } = useAccommodation();

  if (!accommodationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">請先選擇住宿</p>
      </div>
    );
  }

  return (
    <AdminPageHeader title="網站流量分析" icon={BarChart3}>
      <Tabs defaultValue="traffic">
        <TabsList>
          <TabsTrigger value="traffic">流量總覽</TabsTrigger>
          <TabsTrigger value="performance">成效監控</TabsTrigger>
        </TabsList>
        <TabsContent value="traffic" className="mt-4">
          <AnalyticsDashboard accommodationId={accommodationId} />
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          <SalesServiceAnalyticsTab accommodationId={accommodationId} />
        </TabsContent>
      </Tabs>
    </AdminPageHeader>
  );
};

export default Analytics;
