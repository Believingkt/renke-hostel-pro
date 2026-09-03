import { useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addStayToCalendar, type StayCalendarInput } from "@/lib/stayCalendar";

interface AddToCalendarButtonProps extends StayCalendarInput {
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export default function AddToCalendarButton({
  variant = "outline",
  size = "default",
  className,
  ...input
}: AddToCalendarButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await addStayToCalendar(input);
      if (res.status === "created") toast.success("已加入行事曆");
      else if (res.status === "already") toast.info("此訂單已加入行事曆");
      else if (res.status === "downloaded") toast.success("已下載行事曆檔案（.ics）");
      else if (res.status === "denied") toast.error("未取得行事曆權限");
      else toast.error(res.message || "加入行事曆失敗");
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
