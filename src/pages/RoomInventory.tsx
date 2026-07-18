import { useState, useEffect, useCallback } from "react";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Package, CalendarDays, X, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { BookingCalendarGrid } from "@/components/BookingCalendarGrid";
import { AvailabilityCalendarDialog } from "@/components/AvailabilityCalendarDialog";
import OrderDetailPage from "@/pages/OrderDetail";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "room-inventory:open-order-tabs";

interface OpenTab {
  id: string;
  label: string; // order_number (short)
}

export default function RoomInventory() {
  const { currentAccommodationId } = useAccommodation();
  const [calOpen, setCalOpen] = useState(false);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("calendar");

  // Restore from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { tabs: OpenTab[]; activeTab: string };
        if (Array.isArray(parsed.tabs)) {
          setTabs(parsed.tabs);
          if (parsed.activeTab) setActiveTab(parsed.activeTab);
        }
      }
    } catch { /* noop */ }
  }, []);

  // Persist
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTab }));
    } catch { /* noop */ }
  }, [tabs, activeTab]);

  const openOrderTab = useCallback(async (orderId: string) => {
    // If already open, just switch
    if (tabs.some((t) => t.id === orderId)) {
      setActiveTab(orderId);
      return;
    }
    // Fetch order_number for label
    let label = orderId.slice(0, 8);
    try {
      const { data } = await supabase
        .from("orders")
        .select("order_number")
        .eq("id", orderId)
        .maybeSingle();
      if (data?.order_number) label = data.order_number;
    } catch { /* keep fallback */ }
    setTabs((prev) => [...prev, { id: orderId, label }]);
    setActiveTab(orderId);
  }, [tabs]);

  const closeTab = useCallback((orderId: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === orderId);
      const next = prev.filter((t) => t.id !== orderId);
      // If closing active tab, jump to neighbor or calendar
      if (activeTab === orderId) {
        const neighbor = next[idx] || next[idx - 1];
        setActiveTab(neighbor ? neighbor.id : "calendar");
      }
      return next;
    });
  }, [activeTab]);

  return (
    <AdminPageHeader
      title="預訂管理"
      icon={Package}
      breadcrumbs={[{ label: "訂單資訊" }]}
      action={
        <Button variant="outline" size="sm" onClick={() => setCalOpen(true)}>
          <CalendarDays className="h-4 w-4 mr-2" />
          日曆檢視
        </Button>
      }
    >
      {currentAccommodationId && (
        <>
          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b overflow-x-auto scrollbar-thin -mx-2 px-2 mb-4">
            <button
              type="button"
              onClick={() => setActiveTab("calendar")}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                activeTab === "calendar"
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarIcon className="h-4 w-4" />
              <span>日曆</span>
            </button>
            {tabs.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 pl-3 pr-1 py-1.5 text-sm border-b-2 -mb-px transition-colors group",
                  activeTab === t.id
                    ? "border-primary text-primary font-medium bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className="max-w-[140px] truncate"
                  title={t.label}
                >
                  {t.label}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  className="ml-1 rounded p-0.5 hover:bg-muted"
                  aria-label={`關閉 ${t.label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Tab panels — keep mounted to preserve state; toggle visibility */}
          <div className={activeTab === "calendar" ? "" : "hidden"}>
            <BookingCalendarGrid
              accommodationId={currentAccommodationId}
              onOrderClick={openOrderTab}
            />
            <AvailabilityCalendarDialog
              open={calOpen}
              onOpenChange={setCalOpen}
              accommodationId={currentAccommodationId}
            />
          </div>

          {tabs.map((t) => (
            <div key={t.id} className={activeTab === t.id ? "" : "hidden"}>
              <OrderDetailPage
                orderId={t.id}
                embedded
                onClose={() => closeTab(t.id)}
              />
            </div>
          ))}
        </>
      )}
    </AdminPageHeader>
  );
}
