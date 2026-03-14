import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Package, Home } from "lucide-react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { BookingCalendarGrid } from "@/components/BookingCalendarGrid";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default function RoomInventory() {
  const { currentAccommodationId } = useAccommodation();

  return (
    <div className="space-y-6">
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
            <BreadcrumbLink className="text-muted-foreground">訂單資訊</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>預訂管理</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title="預訂管理" icon={Package} />

      {currentAccommodationId && (
        <BookingCalendarGrid accommodationId={currentAccommodationId} />
      )}
    </div>
  );
}
