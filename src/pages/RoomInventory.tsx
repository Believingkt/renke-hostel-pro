import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Package } from "lucide-react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { BookingCalendarGrid } from "@/components/BookingCalendarGrid";

export default function RoomInventory() {
  const { currentAccommodationId } = useAccommodation();

  return (
    <AdminPageHeader
      title="預訂管理"
      icon={Package}
      breadcrumbs={[{ label: "訂單資訊" }]}
    >
      {currentAccommodationId && (
        <BookingCalendarGrid accommodationId={currentAccommodationId} />
      )}
    </AdminPageHeader>
  );
}
