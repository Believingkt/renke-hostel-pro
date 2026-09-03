import { useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { addStayToCalendar, type StayCalendarInput } from "@/lib/stayCalendar";

interface AddToCalendarButtonProps extends Omit<StayCalendarInput, "accommodationName"> {
  /** 已知民宿名稱時直接傳入；未提供則以 accommodationId 查詢 */
  accommodationName?: string;
  accommodationId?: string | null;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export default function AddToCalendarButton({
  variant = "outline",
  size = "default",
  className,
  accommodationName,
  accommodationId,
  ...rest
}: AddToCalendarButtonProps) {
  const [loading, setLoading] = useState(false);

  const resolveAccommodation = async (): Promise<{ name: string; address?: string | null }> => {
    if (accommodationName) return { name: accommodationName, address: rest.address };
    if (!accommodationId) return { name: "民宿", address: rest.address };
    const { data } = await supabase
      .from("accommodation_info")
      .select("name, address")
      .eq("id", accommodationId)
      .maybeSingle();
    return { name: data?.name || "民宿", address: rest.address ?? data?.address ?? null };
  };

  const handleClick = async () => {
    setLoading(true);
    try {
      const acc = await resolveAccommodation();
      const res = await addStayToCalendar({
        ...rest,
        accommodationName: acc.name,
        address: acc.address,
      });
      if (res.status === "created") toast.success("已加入行事曆");
      else if (res.status === "already") toast.info("此訂單已加入行事曆");
      else if (res.status === "downloaded") toast.success("已下載行事曆檔案（.ics）");
      else if (res.status === "denied") toast.error("未取得行事曆權限");
      else toast.error(res.message || "加入行事曆失敗");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入行事曆失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={handleClick} disabled={loading}>
      {loading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <CalendarPlus className="h-4 w-4 mr-2" />
      )}
      加入行事曆
    </Button>
  );
}
