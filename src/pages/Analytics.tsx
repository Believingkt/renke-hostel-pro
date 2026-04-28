import { Link } from "react-router-dom";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { PageHeader } from "@/components/PageHeader";
import { BarChart3, Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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
    <div className="space-y-6 md:space-y-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>網站流量分析</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="網站流量分析"
        description="追蹤網站訪問來源與頁面瀏覽"
        icon={BarChart3}
      />

      <AnalyticsDashboard accommodationId={accommodationId} />
    </div>
  );
};

export default Analytics;
