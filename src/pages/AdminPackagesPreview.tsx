import { useMemo, useState, useEffect, useRef } from "react";
import { format, addDays } from "date-fns";
import { CalendarIcon, RefreshCw, ExternalLink, Smartphone, Monitor } from "lucide-react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Device = "mobile" | "desktop";

const DEVICE_WIDTH: Record<Device, number> = {
  mobile: 390,
  desktop: 1280,
};

const AdminPackagesPreview = () => {
  const { currentAccommodationId } = useAccommodation();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const today = useMemo(() => new Date(), []);
  const [checkIn, setCheckIn] = useState<Date>(() => addDays(today, 7));
  const [checkOut, setCheckOut] = useState<Date>(() => addDays(today, 9));
  const [adults, setAdults] = useState<number>(2);
  const [children, setChildren] = useState<number>(0);
  const [infants, setInfants] = useState<number>(0);
  const [toddlers, setToddlers] = useState<number>(0);
  const [rooms, setRooms] = useState<number>(1);
  const [device, setDevice] = useState<Device>("mobile");
  const [reloadKey, setReloadKey] = useState(0);

  const previewUrl = useMemo(() => {
    if (!currentAccommodationId) return "";
    const params = new URLSearchParams({
      checkIn: format(checkIn, "yyyy-MM-dd"),
      checkOut: format(checkOut, "yyyy-MM-dd"),
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      toddlers: String(toddlers),
      rooms: String(rooms),
      accId: currentAccommodationId,
      previewMode: "1",
    });
    return `/booking/villa/${currentAccommodationId}?${params.toString()}#capacity-price-section`;
  }, [currentAccommodationId, checkIn, checkOut, adults, children, infants, toddlers, rooms]);

  // 自動把 iframe 捲到「入住方案」區段
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      try {
        const doc = iframe.contentDocument;
        const target = doc?.getElementById("capacity-price-section");
        if (target) {
          target.scrollIntoView({ behavior: "auto", block: "start" });
        }
      } catch {
        // cross-origin 安全防呆，無視
      }
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [previewUrl, reloadKey]);

  if (!currentAccommodationId) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="方案前台預覽"
          description="模擬日期與人數，預覽銷售方案在訂房前台的呈現"
        />
        <Card className="p-8 text-center text-muted-foreground">
          請先在上方選擇要預覽的民宿
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="方案前台預覽"
        description="模擬入住日期與人數，即時預覽銷售方案在訂房前台的呈現"
      />

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">入住日期</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !checkIn && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {checkIn ? format(checkIn, "yyyy-MM-dd (eee)") : "選擇日期"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={checkIn}
                  onSelect={(d) => {
                    if (!d) return;
                    setCheckIn(d);
                    if (checkOut <= d) setCheckOut(addDays(d, 1));
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">退房日期</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !checkOut && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {checkOut ? format(checkOut, "yyyy-MM-dd (eee)") : "選擇日期"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={checkOut}
                  onSelect={(d) => d && setCheckOut(d)}
                  disabled={(d) => d <= checkIn}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">大人</Label>
            <Input
              type="number"
              min={1}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">房數</Label>
            <Input
              type="number"
              min={1}
              value={rooms}
              onChange={(e) => setRooms(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">兒童（含費）</Label>
            <Input
              type="number"
              min={0}
              value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">幼兒</Label>
            <Input
              type="number"
              min={0}
              value={toddlers}
              onChange={(e) => setToddlers(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">嬰兒</Label>
            <Input
              type="number"
              min={0}
              value={infants}
              onChange={(e) => setInfants(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">操作</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setReloadKey((k) => k + 1)}
                title="重新整理預覽"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => window.open(previewUrl, "_blank")}
                title="在新分頁開啟"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <div className="ml-auto inline-flex rounded-md border bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => setDevice("mobile")}
                  className={cn(
                    "px-2 py-1 rounded text-xs inline-flex items-center gap-1",
                    device === "mobile" ? "bg-background shadow-sm" : "text-muted-foreground"
                  )}
                  title="手機"
                >
                  <Smartphone className="h-3.5 w-3.5" /> 手機
                </button>
                <button
                  type="button"
                  onClick={() => setDevice("desktop")}
                  className={cn(
                    "px-2 py-1 rounded text-xs inline-flex items-center gap-1",
                    device === "desktop" ? "bg-background shadow-sm" : "text-muted-foreground"
                  )}
                  title="桌機"
                >
                  <Monitor className="h-3.5 w-3.5" /> 桌機
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-3 bg-muted/30">
        <div className="flex justify-center">
          <div
            className="bg-background border rounded-lg shadow-sm overflow-hidden transition-all"
            style={{ width: `min(100%, ${DEVICE_WIDTH[device]}px)` }}
          >
            <iframe
              key={`${previewUrl}-${reloadKey}-${device}`}
              ref={iframeRef}
              src={previewUrl}
              title="銷售方案前台預覽"
              className="w-full block"
              style={{ height: "calc(100vh - 280px)", minHeight: 640 }}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground text-center mt-2">
          已自動捲動到「入住方案」區段；若需查看其他區塊可在預覽內自行滾動
        </p>
      </Card>
    </div>
  );
};

export default AdminPackagesPreview;
