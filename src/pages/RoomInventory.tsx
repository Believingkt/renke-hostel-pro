import { useState } from "react";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Package, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { BookingCalendarGrid } from "@/components/BookingCalendarGrid";
import { AvailabilityCalendarDialog } from "@/components/AvailabilityCalendarDialog";

export default function RoomInventory() {
  const { currentAccommodationId } = useAccommodation();
  const [calOpen, setCalOpen] = useState(false);

  return (
    <AdminPageHeader
      title="預訂管理"
      icon={Package}
      breadcrumbs={[{ label: "訂單資訊" }]}
      actions={
        <Button variant="outline" size="sm" onClick={() => setCalOpen(true)}>
          <CalendarDays className="h-4 w-4 mr-2" />
          日曆檢視
        </Button>
      }
    >
      {currentAccommodationId && (
        <>
          <BookingCalendarGrid accommodationId={currentAccommodationId} />
          <AvailabilityCalendarDialog
            open={calOpen}
            onOpenChange={setCalOpen}
            accommodationId={currentAccommodationId}
          />
        </>
      )}
    </AdminPageHeader>
  );
}
