import { useAccommodation } from "@/contexts/AccommodationContext";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { AdminPageHeader } from "@/components/AdminPageHeader";
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
      <AnalyticsDashboard accommodationId={accommodationId} />
    </AdminPageHeader>
  );
};

export default Analytics;
