import { useState, useEffect, useCallback, useRef } from "react";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Package, CalendarDays, X, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { BookingCalendarGrid } from "@/components/BookingCalendarGrid";
import { AvailabilityCalendarDialog } from "@/components/AvailabilityCalendarDialog";
import OrderDetailPage from "@/pages/OrderDetail";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STORAGE_KEY = "room-inventory:open-order-tabs";

interface OpenTab {
  id: string;
  label: string; // order_number (short)
}

type PendingAction =
  | { kind: "close"; orderId: string }
  | { kind: "switch"; target: string };

export default function RoomInventory() {
  const { currentAccommodationId } = useAccommodation();
  const [calOpen, setCalOpen] = useState(false);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("calendar");
  // Per-tab dirty flags (not persisted — fresh mount = clean)
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<PendingAction | null>(null);
  // Refs to each tab's panel to attach input listeners
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  // Persist tabs
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTab }));
    } catch { /* noop */ }
  }, [tabs, activeTab]);

  // beforeunload warn if any dirty
  useEffect(() => {
    const anyDirty = Object.values(dirtyMap).some(Boolean);
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyMap]);

  const markDirty = useCallback((orderId: string) => {
    setDirtyMap((prev) => (prev[orderId] ? prev : { ...prev, [orderId]: true }));
  }, []);

  const clearDirty = useCallback((orderId: string) => {
    setDirtyMap((prev) => {
      if (!prev[orderId]) return prev;
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  const openOrderTab = useCallback(async (orderId: string) => {
    if (tabs.some((t) => t.id === orderId)) {
      setActiveTab(orderId);
      return;
    }
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

  const doCloseTab = useCallback((orderId: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === orderId);
      const next = prev.filter((t) => t.id !== orderId);
      if (activeTab === orderId) {
        const neighbor = next[idx] || next[idx - 1];
        setActiveTab(neighbor ? neighbor.id : "calendar");
      }
      return next;
    });
    clearDirty(orderId);
  }, [activeTab, clearDirty]);

  const requestCloseTab = useCallback((orderId: string) => {
    if (dirtyMap[orderId]) {
      setPending({ kind: "close", orderId });
    } else {
      doCloseTab(orderId);
    }
  }, [dirtyMap, doCloseTab]);

  const requestSwitchTab = useCallback((target: string) => {
    if (target === activeTab) return;
    // Only guard if leaving a dirty order tab
    if (activeTab !== "calendar" && dirtyMap[activeTab]) {
      setPending({ kind: "switch", target });
    } else {
      setActiveTab(target);
    }
  }, [activeTab, dirtyMap]);

  const confirmPending = () => {
    if (!pending) return;
    if (pending.kind === "close") {
      doCloseTab(pending.orderId);
    } else {
      // discard changes on current tab, switch away
      clearDirty(activeTab);
      setActiveTab(pending.target);
    }
    setPending(null);
  };

  // Track dirty by detecting the presence of the "取消編輯" button in each panel.
  // OrderDetail toggles this button while isEditing is true; when the user saves
  // or cancels, the button disappears and we clear dirty for that tab.
  useEffect(() => {
    const observers: MutationObserver[] = [];
    const check = (id: string, el: HTMLElement) => {
      const editing = !!Array.from(el.querySelectorAll("button")).find((b) =>
        (b.textContent || "").includes("取消編輯")
      );
      if (editing) markDirty(id);
      else clearDirty(id);
    };
    tabs.forEach((t) => {
      const el = panelRefs.current[t.id];
      if (!el) return;
      check(t.id, el);
      const mo = new MutationObserver(() => check(t.id, el));
      mo.observe(el, { childList: true, subtree: true, characterData: true });
      observers.push(mo);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [tabs, activeTab, markDirty, clearDirty]);

  return (
    <>
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
                onClick={() => requestSwitchTab("calendar")}
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
              {tabs.map((t) => {
                const isDirty = !!dirtyMap[t.id];
                return (
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
                      onClick={() => requestSwitchTab(t.id)}
                      className="max-w-[140px] truncate"
                      title={isDirty ? `${t.label}(未儲存)` : t.label}
                    >
                      {t.label}
                      {isDirty && <span className="text-amber-500 ml-0.5">•</span>}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestCloseTab(t.id);
                      }}
                      className="ml-1 rounded p-0.5 hover:bg-muted"
                      aria-label={`關閉 ${t.label}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Panels */}
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
              <div
                key={t.id}
                ref={(el) => { panelRefs.current[t.id] = el; }}
                className={activeTab === t.id ? "" : "hidden"}
              >
                <OrderDetailPage
                  orderId={t.id}
                  embedded
                  onClose={() => requestCloseTab(t.id)}
                />
              </div>
            ))}
          </>
        )}
      </AdminPageHeader>

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>此訂單有尚未儲存的變更</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "close"
                ? "關閉此分頁將會捨棄未儲存的編輯，確定要繼續嗎？"
                : "切換到其他分頁前，未儲存的編輯將會遺失。確定要捨棄變更嗎？"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回繼續編輯</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPending}>捨棄變更</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
