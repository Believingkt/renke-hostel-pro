import { useState } from "react";
import { Share as ShareIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { shareStay, type ShareStayInput } from "@/lib/nativeShare";

interface ShareStayButtonProps extends ShareStayInput {
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
  /** 僅顯示圖示（iOS 標準分享圖示） */
  iconOnly?: boolean;
}

export default function ShareStayButton({
  variant = "outline",
  size = "default",
  className,
  label = "分享",
  iconOnly = false,
  ...input
}: ShareStayButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      let payload = { ...input };
      if (!payload.accommodationName && payload.accommodationId) {
        const { data } = await supabase
          .from("accommodation_info")
          .select("name, description, custom_domain")
          .eq("id", payload.accommodationId)
          .maybeSingle();
        payload = {
          ...payload,
          accommodationName: data?.name ?? null,
          description: payload.description ?? data?.description ?? null,
          customDomain: payload.customDomain ?? data?.custom_domain ?? null,
        };
      }
      const res = await shareStay(payload);
      if (res.status === "copied") toast.success("已複製連結");
      else if (res.status === "error") toast.error("無法分享，請手動複製網址");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分享失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={loading}
      aria-label="分享"
    >
      {loading ? (
        <Loader2 className={`h-4 w-4 animate-spin ${iconOnly ? "" : "mr-2"}`} />
      ) : (
        <ShareIcon className={`h-4 w-4 ${iconOnly ? "" : "mr-2"}`} />
      )}
      {!iconOnly && label}
    </Button>
  );
}
